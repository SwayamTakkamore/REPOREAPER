import type { ModelInfo } from './types';

/**
 * Curated catalog of high-performance local models suited for
 * repository archaeology, code analysis, and software revival roadmaps.
 */
export const CURATED_CATALOG: Omit<ModelInfo, 'isInstalled' | 'isActive' | 'installedPath' | 'filesCount'>[] = [
  {
    id: 'google/gemma-3-1b-it',
    name: 'Gemma 3 1B Instruct',
    author: 'Google',
    parameters: '1.0B',
    description:
      'Google’s state-of-the-art compact instruction model. Exceptional code comprehension, structured JSON adherence, and fast inference on CPU or modest GPUs.',
    sizeBytes: 2040109465, // ~1.9 GB
    sizeFormatted: '1.9 GB',
    tags: ['Recommended', 'Fast', 'Low VRAM', 'Clean JSON'],
    vramRecommended: '2.0 GB',
    architecture: 'Dense Decoder',
  },
  {
    id: 'google/gemma-2-2b-it',
    name: 'Gemma 2 2.6B Instruct',
    author: 'Google',
    parameters: '2.6B',
    description:
      'Higher reasoning capacity with sliding-window attention. Excellent for multi-language syntax detection and complex root-cause explanations.',
    sizeBytes: 3435973836, // ~3.2 GB
    sizeFormatted: '3.2 GB',
    tags: ['High Quality', 'Deep Analysis', 'Balanced'],
    vramRecommended: '4.0 GB',
    architecture: 'Sliding Window Decoder',
  },
  {
    id: 'HuggingFaceTB/SmolLM-135M-Instruct',
    name: 'SmolLM 135M Instruct',
    author: 'Hugging Face',
    parameters: '135M',
    description:
      'Ultra-compact mobile and edge model trained on synthetic educational data. Generates lightning-fast revival summaries with negligible memory usage.',
    sizeBytes: 283115520, // ~270 MB
    sizeFormatted: '270 MB',
    tags: ['Ultra Fast', 'Minimal RAM', 'CPU Friendly'],
    vramRecommended: '500 MB',
    architecture: 'Compact Llama',
  },
  {
    id: 'Qwen/Qwen2.5-Coder-1.5B-Instruct',
    name: 'Qwen 2.5 Coder 1.5B',
    author: 'Alibaba Qwen',
    parameters: '1.5B',
    description:
      'Specialized code intelligence model trained on 5.5T code tokens. Outstanding parsing of complex dependency manifests, build systems, and syntax errors.',
    sizeBytes: 3113851289, // ~2.9 GB
    sizeFormatted: '2.9 GB',
    tags: ['Code Specialist', 'Archaeology Pro', 'Multi-Language'],
    vramRecommended: '3.0 GB',
    architecture: 'RoPE Coder',
  },
  {
    id: 'meta-llama/Llama-3.2-1B-Instruct',
    name: 'Llama 3.2 1B Instruct',
    author: 'Meta',
    parameters: '1.2B',
    description:
      'Meta’s lightweight edge model designed for fast reasoning, tool interaction, and structured report synthesis.',
    sizeBytes: 2576980377, // ~2.4 GB
    sizeFormatted: '2.4 GB',
    tags: ['General Purpose', 'Reliable', 'Efficient'],
    vramRecommended: '2.5 GB',
    architecture: 'Grouped Query Attention',
  },
  {
    id: 'microsoft/Phi-3.5-mini-instruct',
    name: 'Phi-3.5 Mini Instruct',
    author: 'Microsoft',
    parameters: '3.8B',
    description:
      'High-capability small language model trained on textbook-quality synthetic and curated web data for deep reasoning and detailed architectural synthesis.',
    sizeBytes: 4831838208, // ~4.5 GB
    sizeFormatted: '4.5 GB',
    tags: ['Deep Reasoning', 'Architectural Roadmap'],
    vramRecommended: '6.0 GB',
    architecture: 'Dense Transformer',
  },
];
