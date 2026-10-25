/** 画面の版の印（vite.config.ts の define。報告に添える：決定事項 #129） */
declare const __APP_BUILD__: string | undefined;

export const APP_BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';
