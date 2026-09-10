import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import { MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import { IoLogoGithub } from 'react-icons/io5';
import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import { getLocale } from '@/utils/misc';
import {
  parseGithubRepoUrl,
  selectBestArtifact,
  detectChapters,
  markdownToXhtml,
  type ArtifactCandidate,
  type DetectedChapter,
  type GithubRepo,
} from '@/utils/github';
import {
  fetchRepoInfo,
  fetchReleaseAssets,
  fetchRepoTree,
  fetchRawText,
  downloadAsset,
  rawBaseUrl,
} from '@/services/github';
import { TxtToEpubConverter } from '@/utils/txt';

interface GitHubImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFile: (file: File) => Promise<void> | void;
}

type Phase = 'input' | 'loading' | 'pickArtifact' | 'confirmChapters' | 'working';

interface ChapterRow extends DetectedChapter {
  keep: boolean;
}

/** Endonym labels so the language list reads naturally regardless of UI locale. */
const LANG_LABEL: Record<string, string> = {
  'zh-cn': '简体中文',
  'zh-tw': '繁體中文',
  zh: '中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  ru: 'Русский',
  ar: 'العربية',
  ta: 'தமிழ்',
  vi: 'Tiếng Việt',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  pt: 'Português',
  it: 'Italiano',
};

/** Preferred language codes derived from the app locale, most specific first. */
const preferredLangs = (): string[] => {
  const locale = getLocale().toLowerCase();
  const primary = locale.split('-')[0]!;
  return locale === primary ? [locale] : [locale, primary];
};

const dirOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

const candidateTitle = (c: ArtifactCandidate): string =>
  c.lang ? (LANG_LABEL[c.lang] ?? c.lang.toUpperCase()) : c.asset.name;

const formatSize = (bytes?: number): string =>
  bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '';

const GitHubImportDialog: React.FC<GitHubImportDialogProps> = ({ isOpen, onClose, onImportFile }) => {
  const _ = useTranslation();
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [repo, setRepo] = useState<GithubRepo | null>(null);
  const [branch, setBranch] = useState('');
  const [bookTitle, setBookTitle] = useState('');
  const [candidates, setCandidates] = useState<ArtifactCandidate[]>([]);
  const [recommended, setRecommended] = useState<ArtifactCandidate | null>(null);
  const [chapters, setChapters] = useState<ChapterRow[]>([]);
  const [failedPaths, setFailedPaths] = useState<Set<string>>(new Set());
  // Cache of already-fetched chapter XHTML (path -> content) so a retry after a
  // failure resumes instead of re-downloading everything.
  const contentCache = useRef<Map<string, string>>(new Map());

  const reset = () => {
    setUrl('');
    setPhase('input');
    setError(null);
    setProgress('');
    setRepo(null);
    setBranch('');
    setBookTitle('');
    setCandidates([]);
    setRecommended(null);
    setChapters([]);
    setFailedPaths(new Set());
    contentCache.current.clear();
  };

  const close = () => {
    reset();
    onClose();
  };

  const finishImport = async (file: File) => {
    try {
      await onImportFile(file);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('input');
    }
  };

  const downloadArtifact = async (candidate: ArtifactCandidate) => {
    setPhase('working');
    setProgress(_('Downloading {{name}}…', { name: candidate.asset.name }));
    try {
      const buffer = await downloadAsset(candidate.asset.url);
      const type = candidate.ext === 'epub' ? 'application/epub+zip' : 'application/pdf';
      await finishImport(new File([buffer], candidate.asset.name, { type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase(candidates.length > 0 ? 'pickArtifact' : 'input');
    }
  };

  const analyze = async () => {
    const parsed = parseGithubRepoUrl(url);
    if (!parsed) {
      setError(_('Enter a valid GitHub repository URL.'));
      return;
    }
    setError(null);
    setPhase('loading');
    setProgress(_('Analyzing repository…'));
    try {
      const info = await fetchRepoInfo(parsed);
      setRepo(parsed);
      setBranch(info.defaultBranch);
      setBookTitle((info.description?.trim() || info.name).slice(0, 200));

      const assets = await fetchReleaseAssets(parsed);
      const selection = selectBestArtifact(assets, preferredLangs());

      if (selection.candidates.length === 1) {
        // Only one edition — no choice to make.
        await downloadArtifact(selection.candidates[0]!);
        return;
      }
      if (selection.candidates.length > 1) {
        // Multiple editions — always let the user choose (the locale match is
        // pre-highlighted as recommended).
        setCandidates(selection.candidates);
        setRecommended(selection.pick);
        setPhase('pickArtifact');
        return;
      }

      // Case B: no downloadable artifact — assemble from markdown chapters.
      setProgress(_('Scanning repository files…'));
      const paths = await fetchRepoTree(parsed, info.defaultBranch);
      const detected = detectChapters(paths, preferredLangs());
      if (detected.length === 0) {
        setError(_('No downloadable book or markdown chapters found in this repository.'));
        setPhase('input');
        return;
      }
      setChapters(detected.map((c) => ({ ...c, keep: true })));
      setPhase('confirmChapters');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('input');
    }
  };

  const assemble = async () => {
    if (!repo) return;
    const selected = chapters.filter((c) => c.keep);
    if (selected.length === 0) {
      setError(_('Select at least one chapter.'));
      return;
    }
    setError(null);
    setPhase('working');

    const base = rawBaseUrl(repo, branch);
    const cache = contentCache.current;
    const failed = new Set<string>();

    // Fetch each chapter, resuming from cache and skipping ones that fail so a
    // single bad file (e.g. a 404) never aborts the whole import.
    for (let i = 0; i < selected.length; i++) {
      const { path } = selected[i]!;
      if (cache.has(path)) continue;
      setProgress(_('Fetching chapter {{n}}/{{total}}…', { n: i + 1, total: selected.length }));
      try {
        const md = await fetchRawText(repo, branch, path);
        cache.set(path, markdownToXhtml(md, { rawBase: base, fileDir: dirOf(path) }));
      } catch {
        failed.add(path);
      }
    }

    setFailedPaths(failed);

    const ready = selected.filter((c) => cache.has(c.path));
    if (ready.length === 0) {
      setError(_('Could not fetch any chapters. Check the repository and try again.'));
      setPhase('confirmChapters');
      return;
    }
    if (failed.size > 0) {
      // Keep what we have cached; let the user retry (resumes) or uncheck the
      // failing chapters (marked in red) and import the rest.
      setError(
        _('{{count}} chapter(s) could not be fetched (marked below). Retry to resume, or uncheck them.', {
          count: failed.size,
        }),
      );
      setPhase('confirmChapters');
      return;
    }

    try {
      setProgress(_('Building EPUB…'));
      const file = await new TxtToEpubConverter().convertChapters({
        chapters: ready.map((c) => ({ title: c.title, content: cache.get(c.path)! })),
        bookTitle: bookTitle || repo.repo,
        language: getLocale(),
        identifier: `github:${repo.owner}/${repo.repo}`,
      });
      await finishImport(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('confirmChapters');
    }
  };

  const moveChapter = (index: number, delta: number) => {
    setChapters((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const toggleChapter = (index: number) => {
    setChapters((prev) => prev.map((c, i) => (i === index ? { ...c, keep: !c.keep } : c)));
  };

  const keptCount = chapters.filter((c) => c.keep).length;

  // Recommended edition first, so the highlighted choice sits at the top.
  const orderedCandidates = recommended
    ? [recommended, ...candidates.filter((c) => c.asset.url !== recommended.asset.url)]
    : candidates;

  return (
    <Dialog isOpen={isOpen} title={_('Import from GitHub')} onClose={close} compact>
      <div className='flex min-h-0 flex-1 flex-col px-6 pb-6 pt-1'>
        {error && (
          <div className='alert alert-error mb-3 py-2 text-sm' role='alert'>
            {error}
          </div>
        )}

        {phase === 'input' && (
          <div className='mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5 text-center'>
            <div className='bg-base-200 flex h-16 w-16 items-center justify-center rounded-2xl'>
              <IoLogoGithub className='h-9 w-9' />
            </div>
            <p className='text-base-content/60 text-sm leading-relaxed'>
              {_(
                'Paste a public GitHub repository. If it publishes an EPUB/PDF, you can pick an edition to download; otherwise its markdown chapters are assembled into a book.',
              )}
            </p>
            <input
              type='text'
              className='input input-bordered w-full text-center'
              placeholder='https://github.com/owner/repo'
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && analyze()}
            />
            <button className='btn btn-primary w-full' disabled={!url.trim()} onClick={analyze}>
              {_('Analyze')}
            </button>
          </div>
        )}

        {(phase === 'loading' || phase === 'working') && (
          <div className='flex flex-1 flex-col items-center justify-center gap-4'>
            <span className='loading loading-dots loading-lg text-primary' />
            <span className='text-base-content/70 text-sm'>{progress}</span>
          </div>
        )}

        {phase === 'pickArtifact' && (
          <div className='mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 pt-1'>
            <div className='text-center'>
              <h3 className='font-semibold'>{_('Choose a version')}</h3>
              <p className='text-base-content/60 text-sm'>
                {_('Multiple editions are available — pick a language and format.')}
              </p>
            </div>
            <ul className='min-h-0 flex-1 space-y-2 overflow-y-auto py-1'>
              {orderedCandidates.map((c) => {
                const isRec = !!recommended && c.asset.url === recommended.asset.url;
                return (
                  <li key={c.asset.url}>
                    <button
                      className={clsx(
                        'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                        'hover:bg-base-200',
                        isRec ? 'border-primary bg-primary/5' : 'border-base-300',
                      )}
                      onClick={() => downloadArtifact(c)}
                    >
                      <div className='min-w-0'>
                        <div className='truncate font-medium'>{candidateTitle(c)}</div>
                        {formatSize(c.asset.size) && (
                          <div className='text-base-content/50 text-xs'>
                            {formatSize(c.asset.size)}
                          </div>
                        )}
                      </div>
                      <div className='ml-2 flex shrink-0 items-center gap-2'>
                        {isRec && <span className='badge badge-primary badge-sm'>{_('Recommended')}</span>}
                        <span
                          className={clsx(
                            'badge badge-sm',
                            c.ext === 'epub' ? 'badge-outline' : 'badge-ghost',
                          )}
                        >
                          {c.ext.toUpperCase()}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {phase === 'confirmChapters' && (
          <div className='mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col gap-3 pt-1'>
            <label className='flex flex-col gap-1 text-sm'>
              <span className='text-base-content/70'>{_('Book title')}</span>
              <input
                type='text'
                className='input input-bordered input-sm w-full'
                value={bookTitle}
                onChange={(e) => setBookTitle(e.target.value)}
              />
            </label>
            <p className='text-base-content/60 text-sm'>
              {_('Detected chapters — uncheck to skip, reorder with the arrows:')}
            </p>
            <ul className='border-base-300 divide-base-200 min-h-0 flex-1 divide-y overflow-y-auto rounded-xl border'>
              {chapters.map((c, i) => {
                const isFailed = failedPaths.has(c.path);
                return (
                <li key={c.path} className='hover:bg-base-200 flex items-center gap-3 px-3 py-2'>
                  <input
                    type='checkbox'
                    className='checkbox checkbox-sm'
                    checked={c.keep}
                    onChange={() => toggleChapter(i)}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className={clsx('flex items-center gap-1.5 truncate text-sm', isFailed && 'text-error')}>
                      {c.title}
                      {isFailed && <span className='badge badge-error badge-xs'>{_('failed')}</span>}
                    </div>
                    <div className='text-base-content/50 truncate text-xs'>{c.path}</div>
                  </div>
                  <div className='flex shrink-0'>
                    <button
                      className='btn btn-ghost btn-xs btn-square'
                      disabled={i === 0}
                      onClick={() => moveChapter(i, -1)}
                      aria-label={_('Move up')}
                    >
                      <MdArrowUpward />
                    </button>
                    <button
                      className='btn btn-ghost btn-xs btn-square'
                      disabled={i === chapters.length - 1}
                      onClick={() => moveChapter(i, 1)}
                      aria-label={_('Move down')}
                    >
                      <MdArrowDownward />
                    </button>
                  </div>
                </li>
                );
              })}
            </ul>
            <button className='btn btn-primary w-full' disabled={keptCount === 0} onClick={assemble}>
              {_('Import {{count}} chapter(s)', { count: keptCount })}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default GitHubImportDialog;
