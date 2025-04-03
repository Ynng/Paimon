import { emit, listen } from "@tauri-apps/api/event";
import {
  isRegistered,
  register,
  ShortcutEvent,
  ShortcutHandler,
  unregister,
} from "@tauri-apps/plugin-global-shortcut";
import { useCallback, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { codeToGlobalShortcutKey } from "./key";

export const MAX_SHORTCUT_LENGTH = 4;
export const TOGGLE_FUI_SHORTCUT = "toggle-fui";
export const USER_IGNORE_NEXT_SHORTCUT = "user-ignore-next";

export const useGlobalShortcut = (
  shortcutId: string,
  onKeyDown: () => void,
) => {
  const rebindShortcut = (keys: string[]) => {
    return bindGlobalShortcut(keys, (event: ShortcutEvent) => {
      if (event.state == "Pressed") {
        onKeyDown();
      }
    });
  };

  const unbindShortcut = (keys: string[]) => {
    return unbindGlobalShortcut(keys);
  };

  const onShortcutChangeError = (err: ShortcutError) => {
    emitShortcutChangeFailedEvent(shortcutId, err);
  };

  return useShortcut(
    shortcutId,
    rebindShortcut,
    onShortcutChangeError,
    unbindShortcut,
  );
};

const useShortcut = (
  shortcutId: string,
  onShortcutChange: (shortcut: string[]) => Promise<void>,
  onShortcutChangeError: (err: ShortcutError) => void,
  onCleanup: (shortcut: string[]) => Promise<void>,
) => {
  const storageKey = `shortcut_${shortcutId}`;
  const [shortcut, setShortcut] = useLocalStorage<string[]>(
    storageKey,
    [],
  );
  const [disabled, setDisabled] = useState(false);
  const [previousShortcut, setPreviousShortcut] = useState<string[]>([]);

  useEffect(() => {
    if (shortcut.length === 0) return;
    if (disabled) return;
    
    // Check if the shortcut has actually changed
    const shortcutChanged = 
      previousShortcut.length !== shortcut.length || 
      shortcut.some((key, index) => previousShortcut[index] !== key);
    
    if (!shortcutChanged) return;
    
    // Update the previous shortcut
    setPreviousShortcut(shortcut);

    let isSuccess = true;
    onShortcutChange(shortcut).catch((err) => {
      console.error(err);
      if (err instanceof ShortcutError) {
        onShortcutChangeError(err);
      }
      isSuccess = false;
    });

    return () => {
      if (isSuccess && onCleanup) {
        onCleanup(shortcut).catch(() => {});
      }
    };
  }, [shortcut, disabled, onShortcutChange, onShortcutChangeError, onCleanup, previousShortcut]);

  useEffect(() => {
    const unlistenChangeEvent = listen(
      getShortcutChangeEventName(shortcutId),
      (data) => {
        if (!data.payload) return;
        const newShortcut = data.payload as string[];
        setShortcut(newShortcut);
        setDisabled(false);
      },
    );
    const unlistenEditingEvent = listen(
      getShortcutEditingEventName(shortcutId),
      (data) => {
        const isEditing = data.payload as boolean;
        setDisabled(isEditing);
      },
    );
    return () => {
      unlistenChangeEvent.then((fn) => fn());
      unlistenEditingEvent.then((fn) => fn());
    };
  }, [shortcutId, setShortcut]);

  return {
    shortcut: shortcut || [],
  };
};

export const useShortcutEditor = (shortcutId: string) => {
  const [isEditing, setIsEditing] = useState(false);
  const startEdit = useCallback(() => {
    setIsEditing(true);
    emitShortcutEditingEvent(shortcutId, true);
  }, [shortcutId]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    emitShortcutEditingEvent(shortcutId, false);
  }, [shortcutId]);

  const setKeybind = useCallback(
    (keys: string[]) => {
      if (keys.length > 0) {
        emitShortcutChangeEvent(shortcutId, keys);
      }
      emitShortcutEditingEvent(shortcutId, false);
      setTimeout(() => {
        setIsEditing(false);
      }, 100);
    },
    [shortcutId],
  );

  const clearShortcut = useCallback(() => {
    emitShortcutChangeEvent(shortcutId, []);
    setTimeout(() => {
      setIsEditing(false);
    }, 100);
  }, [shortcutId]);

  return {
    isEditing,
    startEdit,
    cancelEdit,
    setKeybind,
    clearShortcut,
  };
};

async function unbindGlobalShortcut(keys: string[]) {
  const keyStr = keys.map(codeToGlobalShortcutKey).join("+");
  try {
    if (await isRegistered(keyStr)) {
      await unregister(keyStr);
    }
  } catch (err) {
    if (typeof err === "string") {
      let errType = ShortcutErrorType.UNKNOWN;
      if (err.includes("valid")) errType = ShortcutErrorType.INVALID;
      throw new ShortcutError(errType, keys, { msg: err });
    } else throw err;
  }
}

async function bindGlobalShortcut(keys: string[], handler: ShortcutHandler) {
  const keyStr = keys.map(codeToGlobalShortcutKey).join("+");
  await unbindGlobalShortcut(keys).catch(() => {}); // Ignore error, register will throw if it really can't register
  try {
    await register(keyStr, handler);
  } catch (err) {
    if (typeof err === "string") {
      let errType = ShortcutErrorType.UNKNOWN;
      if (err.includes("valid")) errType = ShortcutErrorType.INVALID;
      throw new ShortcutError(errType, keys, { msg: err });
    } else throw err;
  }
}

const getShortcutChangeEventName = (shortcutId: string) =>
  `${shortcutId}-shortcut-changed`;

const emitShortcutChangeEvent = (shortcutId: string, keys: string[]) => {
  emit(getShortcutChangeEventName(shortcutId), keys);
};

const getShortcutEditingEventName = (shortcutId: string) =>
  `${shortcutId}-shortcut-editing`;
const emitShortcutEditingEvent = (shortcutId: string, isEdit: boolean) => {
  emit(getShortcutEditingEventName(shortcutId), isEdit);
};

export enum ShortcutErrorType {
  INVALID = "invalid",
  DUPLICATE = "duplicate",
  UNKNOWN = "unknown",
}

export const SHORTCUT_CHANGE_FAILED_EVENT = "shortcut-change-failed";

export class ShortcutError extends Error {
  constructor(
    public type: ShortcutErrorType,
    public shortcut: string[],
    public param?: Record<string, string>,
  ) {
    super();
  }
}

export interface ShortcutChangeFailedEventPayload {
  shortcutId: string;
  error: ShortcutError;
}

export const emitShortcutChangeFailedEvent = (
  shortcutId: string,
  error: ShortcutError,
) => {
  emit(SHORTCUT_CHANGE_FAILED_EVENT, { shortcutId, error });
};
