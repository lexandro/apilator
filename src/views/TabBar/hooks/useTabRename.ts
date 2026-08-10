import { useState, useRef, useEffect, useCallback } from 'react';

interface UseTabRenameOptions {
  initialName: string | undefined;
  getDefaultTitle: () => string;
  onRename: (name: string | undefined) => void;
}

interface UseTabRenameReturn {
  isRenaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement>;
  startRename: () => void;
  handleRenameChange: (value: string) => void;
  handleRenameSubmit: () => void;
  handleRenameKeyDown: (e: React.KeyboardEvent) => void;
  cancelRename: () => void;
}

export function useTabRename({
  initialName,
  getDefaultTitle,
  onRename,
}: UseTabRenameOptions): UseTabRenameReturn {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null!);

  const startRename = useCallback(() => {
    setRenameValue(initialName || getDefaultTitle());
    setIsRenaming(true);
  }, [initialName, getDefaultTitle]);

  const handleRenameChange = useCallback((value: string) => {
    setRenameValue(value);
  }, []);

  const handleRenameSubmit = useCallback(() => {
    const trimmed = renameValue.trim();
    onRename(trimmed || undefined);
    setIsRenaming(false);
  }, [renameValue, onRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
    }
  }, [handleRenameSubmit]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  return {
    isRenaming,
    renameValue,
    renameInputRef,
    startRename,
    handleRenameChange,
    handleRenameSubmit,
    handleRenameKeyDown,
    cancelRename,
  };
}
