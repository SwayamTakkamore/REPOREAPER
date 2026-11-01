#!/usr/bin/env python3
"""
REPOREAPER — Hugging Face Local Inference Server

A lightweight, local inference server compatible with Hugging Face Text Generation
Inference (TGI) and OpenAI chat completions endpoints (/v1/chat/completions).

Supports dynamic model switching on the fly via POST /v1/switch_model.
Runs directly on the host machine using installed PyTorch and Transformers.
Zero Docker or cloud dependencies.

Usage:
    python3 scripts/hf_local_server.py
    python3 scripts/hf_local_server.py --model google/gemma-3-1b-it --port 8080
"""

import argparse
import os
import sys
import time
from typing import Any, Dict, List, Optional

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    import uvicorn
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
except ImportError as err:
    print(f"Error: Missing required dependency for local inference server: {err}")
    print("Ensure PyTorch, Transformers, FastAPI, and Uvicorn are installed.")
    sys.exit(1)


def find_cached_snapshot(model_name: str) -> Optional[str]:
    """Finds local snapshot path in ~/.cache/huggingface/hub if available."""
    clean_name = model_name.replace("/", "--")
    hub_dir = os.path.expanduser(f"~/.cache/huggingface/hub/models--{clean_name}/snapshots")
    if os.path.isdir(hub_dir):
        snapshots = [s for s in os.listdir(hub_dir) if not s.startswith(".")]
        if snapshots:
            return os.path.join(hub_dir, snapshots[0])
    return None


def create_app(initial_model_name: str, device: str = "auto") -> FastAPI:
    app = FastAPI(
        title="REPOREAPER Hugging Face Local Inference Server",
        description="Local TGI / OpenAI compatible endpoint for repository revival synthesis.",
        version="1.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    state: Dict[str, Any] = {
        "model_name": initial_model_name,
        "tokenizer": None,
        "model": None,
        "has_cuda": torch.cuda.is_available(),
    }

    def load_active_model(target_model_name: str):
        cached_path = find_cached_snapshot(target_model_name)
        load_target = cached_path if cached_path else target_model_name
        print(f"[*] Initializing model: {target_model_name}")
        if cached_path:
            print(f"[*] Found local cached snapshot at: {cached_path}")

        print("[*] Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(load_target)

        has_cuda = state["has_cuda"]
        torch_dtype = torch.bfloat16 if has_cuda else torch.float32
        device_map = "auto" if has_cuda else "cpu"

        print(f"[*] Loading model weights (CUDA: {has_cuda}, dtype: {torch_dtype})...")
        model = AutoModelForCausalLM.from_pretrained(
            load_target,
            dtype=torch_dtype,
            device_map=device_map,
        )
        model.eval()

        # Update global state
        state["model_name"] = target_model_name
        state["tokenizer"] = tokenizer
        state["model"] = model
        print(f"[✓] Model {target_model_name} is active on {device_map}!")

    # Initial model load
    load_active_model(initial_model_name)

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "model": state["model_name"],
            "device": str(state["model"].device),
            "cuda_available": state["has_cuda"],
        }

    @app.get("/")
    async def root():
        return {"service": "reporeaper-hf-local", "status": "running", "model": state["model_name"]}

    @app.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [
                {
                    "id": state["model_name"],
                    "object": "model",
                    "created": int(time.time()),
                    "owned_by": "local",
                }
            ],
        }

    @app.post("/v1/switch_model")
    async def switch_model(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        new_model = body.get("model")
        if not new_model or not isinstance(new_model, str):
            raise HTTPException(status_code=400, detail="Missing required 'model' field")

        if new_model == state["model_name"]:
            return {"status": "ok", "model": new_model, "message": "Model already active"}

        try:
            load_active_model(new_model)
            return {"status": "ok", "model": new_model, "message": f"Switched to {new_model}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to switch model: {str(e)}")

    @app.post("/v1/chat/completions")
    async def chat_completions(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        messages = body.get("messages", [])
        if not messages:
            raise HTTPException(status_code=400, detail="Missing required 'messages' array")

        max_tokens = int(body.get("max_tokens", 2048))
        temperature = float(body.get("temperature", 0.2))

        try:
            tokenizer = state["tokenizer"]
            model = state["model"]

            input_text = tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )
            inputs = tokenizer(input_text, return_tensors="pt").to(model.device)

            with torch.no_grad():
                gen_kwargs: Dict[str, Any] = {
                    "max_new_tokens": max_tokens,
                    "do_sample": temperature > 0.0,
                }
                if temperature > 0.0:
                    gen_kwargs["temperature"] = temperature
                outputs = model.generate(**inputs, **gen_kwargs)

            input_length = inputs.input_ids.shape[1]
            generated_tokens = outputs[0][input_length:]
            output_text = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()

            return {
                "id": f"chatcmpl-{int(time.time()*1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": state["model_name"],
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": output_text,
                        },
                        "finish_reason": "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": int(input_length),
                    "completion_tokens": int(len(generated_tokens)),
                    "total_tokens": int(input_length + len(generated_tokens)),
                },
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

    @app.post("/generate")
    async def generate_native(request: Request):
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        inputs_text = body.get("inputs", "")
        parameters = body.get("parameters", {})
        max_new_tokens = int(parameters.get("max_new_tokens", 2048))
        temperature = float(parameters.get("temperature", 0.2))

        try:
            tokenizer = state["tokenizer"]
            model = state["model"]

            inputs = tokenizer(inputs_text, return_tensors="pt").to(model.device)
            with torch.no_grad():
                outputs = model.generate(
                    **inputs,
                    max_new_tokens=max_new_tokens,
                    do_sample=temperature > 0.0,
                    temperature=temperature if temperature > 0.0 else None,
                )
            input_length = inputs.input_ids.shape[1]
            output_text = tokenizer.decode(outputs[0][input_length:], skip_special_tokens=True)
            return {"generated_text": output_text.strip()}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

    return app


def main():
    parser = argparse.ArgumentParser(description="REPOREAPER Hugging Face Local Inference Server")
    parser.add_argument(
        "--model",
        default=os.environ.get("AI_MODEL", "google/gemma-3-1b-it"),
        help="Hugging Face model name or local path (default: google/gemma-3-1b-it)",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("HF_HOST", "127.0.0.1"),
        help="Host address to bind to (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("HF_PORT", "8080")),
        help="Port to listen on (default: 8080)",
    )

    args = parser.parse_args()

    app = create_app(initial_model_name=args.model)
    print(f"[*] Starting local server on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
