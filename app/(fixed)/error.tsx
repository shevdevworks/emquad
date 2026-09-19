'use client';

import { ErrorScreen, type ErrorScreenProps } from '@/components/global/ErrorScreen';

export default function FixedError(props: ErrorScreenProps) {
  return <ErrorScreen {...props} />;
}
