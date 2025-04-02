import { proxy } from 'valtio'

export const appStore = proxy({
    screenshotting: false,
})

