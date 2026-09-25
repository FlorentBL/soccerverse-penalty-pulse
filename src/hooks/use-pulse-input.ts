'use client';
import { useEffect } from 'react';
import type { SubmitInput } from '@xayaarcade/sdk';
import type { PulseInput } from '@/lib/pulse/channel';
let liveSubmit: SubmitInput | null = null;
export async function submitPulseInput(input: PulseInput): Promise<boolean> {
  return liveSubmit ? liveSubmit(input) : false;
}
export function usePulseInput(submit: SubmitInput | null): void {
  useEffect(() => {
    liveSubmit = submit;
    return () => { if (liveSubmit === submit) liveSubmit = null; };
  }, [submit]);
}
