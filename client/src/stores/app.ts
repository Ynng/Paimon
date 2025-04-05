import { Monitor } from '@tauri-apps/api/window';
import { proxy } from 'valtio'

export type AppStore = {
    screenshotting: boolean;
    monitor: Monitor | null;
    responses: Response[];
}

export const appStore = proxy<AppStore>({
    screenshotting: false,
    monitor: null,
    responses: [],
})

