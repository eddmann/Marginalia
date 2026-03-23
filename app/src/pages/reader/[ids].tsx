import { useRouter } from 'next/router';
import { EnvProvider } from '@/context/EnvContext';
import Reader from '@/app/reader/components/Reader';

export default function Page() {
  const router = useRouter();
  const ids = router.query['ids'] as string;
  return (
    <EnvProvider>
      <Reader ids={ids} />
    </EnvProvider>
  );
}
