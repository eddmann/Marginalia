import { IconType } from 'react-icons';
import { FiSearch } from 'react-icons/fi';
import { FiCopy } from 'react-icons/fi';
import { PiHighlighterFill } from 'react-icons/pi';
import { BsPencilSquare } from 'react-icons/bs';
import { LuMessageSquareText } from 'react-icons/lu';
import { AnnotationToolType } from '@/types/annotator';
import { stubTranslation as _ } from '@/utils/misc';

type AnnotationToolButton = {
  type: AnnotationToolType;
  label: string;
  tooltip: string;
  Icon: IconType;
  quickAction?: boolean;
};

function createAnnotationToolButtons<T extends AnnotationToolType>(
  buttons: AnnotationToolType extends T
    ? {
        [K in T]: {
          type: K;
          label: string;
          tooltip: string;
          Icon: IconType;
          quickAction?: boolean;
        };
      }[T][]
    : never,
): AnnotationToolButton[] {
  return buttons;
}

export const annotationToolButtons = createAnnotationToolButtons([
  { type: 'copy', label: _('Copy'), tooltip: _('Copy text after selection'), Icon: FiCopy },
  {
    type: 'highlight',
    label: _('Highlight'),
    tooltip: _('Highlight text after selection'),
    Icon: PiHighlighterFill,
    quickAction: true,
  },
  {
    type: 'annotate',
    label: _('Annotate'),
    tooltip: _('Annotate text after selection'),
    Icon: BsPencilSquare,
  },
  {
    type: 'search',
    label: _('Search'),
    tooltip: _('Search text after selection'),
    Icon: FiSearch,
    quickAction: true,
  },
  {
    type: 'chat',
    label: _('Ask AI'),
    tooltip: _('Send selection to AI chat'),
    Icon: LuMessageSquareText,
    quickAction: true,
  },
]);

export const annotationToolQuickActions = annotationToolButtons.filter(
  (button) => button.quickAction,
);
