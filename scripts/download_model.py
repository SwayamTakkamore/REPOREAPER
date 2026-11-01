#!/usr/bin/env python3
"""
REPOREAPER — Hugging Face Model Downloader Helper

Downloads a model from Hugging Face Hub with real-time JSON progress telemetry on stdout.
Designed to be invoked by the REPOREAPER Model Manager.
"""

import argparse
import json
import os
import signal
import sys
import time

try:
    from huggingface_hub import HfApi, hf_hub_download, snapshot_download
    from tqdm.auto import tqdm
except ImportError as err:
    sys.stdout.write(json.dumps({"status": "error", "message": f"Missing dependency: {err}"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)


class StreamProgressTqdm(tqdm):
    """Custom tqdm callback emitting JSON progress events for REPOREAPER UI."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._last_emit = 0.0

    def update(self, n=1):
        super().update(n)
        now = time.time()
        # Rate limit stdout progress updates to ~10 per second to avoid saturating pipes
        if now - self._last_emit < 0.1 and (self.n or 0) < (self.total or 0):
            return

        self._last_emit = now
        speed = self.format_dict.get("rate") or 0.0
        total = self.total or 0
        current = self.n or 0
        percent = (current / total * 100.0) if total > 0 else 0.0
        eta = ((total - current) / speed) if speed > 0 and total >= current else 0.0

        event = {
            "status": "downloading",
            "downloaded": int(current),
            "total": int(total),
            "percent": round(percent, 1),
            "speed": round(speed, 1),
            "eta": round(eta, 1),
        }
        sys.stdout.write(json.dumps(event) + "\n")
        sys.stdout.flush()


def handle_sigterm(signum, frame):
    sys.stdout.write(json.dumps({"status": "cancelled", "message": "Download cancelled by user."}) + "\n")
    sys.stdout.flush()
    sys.exit(0)


def main():
    signal.signal(signal.SIGINT, handle_sigterm)
    signal.signal(signal.SIGTERM, handle_sigterm)

    parser = argparse.ArgumentParser(description="REPOREAPER Model Downloader")
    parser.add_argument("--model", required=True, help="Hugging Face model repository ID")
    parser.add_argument("--token", default=None, help="Optional Hugging Face access token")
    parser.add_argument("--cache-dir", default=None, help="Directory to store downloads")

    args = parser.parse_args()
    model_id = args.model.strip()

    cache_dir = args.cache_dir or os.path.expanduser("~/.cache/huggingface/hub")
    token = args.token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_API_KEY")

    sys.stdout.write(json.dumps({"status": "queued", "modelId": model_id}) + "\n")
    sys.stdout.flush()

    try:
        api = HfApi(token=token)
        info = api.model_info(model_id)

        # Essential inference patterns
        allow_patterns = [
            "*.json",
            "*.safetensors",
            "*.model",
            "*.txt",
            "*.bin",
        ]
        ignore_patterns = [
            "onnx/*",
            "tflite/*",
            "openvino/*",
            "coreml/*",
            "*.msgpack",
            "*.h5",
            "*.ot",
            ".git*",
        ]

        sys.stdout.write(json.dumps({
            "status": "downloading",
            "modelId": model_id,
            "message": f"Downloading weights for {model_id}...",
            "downloaded": 0,
            "total": 0,
            "percent": 0.0,
            "speed": 0.0,
            "eta": 0.0,
        }) + "\n")
        sys.stdout.flush()

        # Download snapshot with custom progress tqdm
        dest_dir = snapshot_download(
            repo_id=model_id,
            token=token,
            allow_patterns=allow_patterns,
            ignore_patterns=ignore_patterns,
            tqdm_class=StreamProgressTqdm,
        )

        # Calculate final size
        total_size = 0
        for root, dirs, files in os.walk(dest_dir):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    total_size += os.path.getsize(fp)
                except OSError:
                    pass

        sys.stdout.write(json.dumps({
            "status": "completed",
            "modelId": model_id,
            "destDir": dest_dir,
            "totalBytes": total_size,
            "percent": 100.0,
        }) + "\n")
        sys.stdout.flush()

    except Exception as e:
        sys.stdout.write(json.dumps({
            "status": "error",
            "modelId": model_id,
            "error": str(e),
        }) + "\n")
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
