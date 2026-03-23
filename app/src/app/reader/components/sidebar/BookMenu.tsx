import clsx from 'clsx';
import React from 'react';

import { useSidebarStore } from '@/store/sidebarStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface BookMenuProps {
  menuClassName?: string;
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

const BookMenu: React.FC<BookMenuProps> = ({ menuClassName, setIsDropdownOpen }) => {
  const _ = useTranslation();
  const { sideBarBookKey } = useSidebarStore();

  const handleReloadPage = () => {
    window.location.reload();
    setIsDropdownOpen?.(false);
  };
  const handleExportAnnotations = () => {
    eventDispatcher.dispatch('export-annotations', { bookKey: sideBarBookKey });
    setIsDropdownOpen?.(false);
  };
  return (
    <Menu
      className={clsx('book-menu dropdown-content z-20 shadow-2xl', menuClassName)}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      <MenuItem label={_('Export Annotations')} onClick={handleExportAnnotations} />
      <MenuItem label={_('Reload Page')} shortcut='Shift+R' onClick={handleReloadPage} />
    </Menu>
  );
};

export default BookMenu;
