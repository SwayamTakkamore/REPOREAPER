import type { Metadata } from 'next';

import AnalyzerApp from '@/components/AnalyzerApp';

export const metadata: Metadata = {
  title: 'REPOREAPER — Excavate a repository',
  description:
    'Enter any public GitHub repository URL to receive a deterministic 100-point health score, evidence-backed findings, and a phased AI revival roadmap.',
};

export default function HomePage() {
  return <AnalyzerApp />;
}
