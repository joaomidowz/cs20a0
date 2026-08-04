import { env } from '$env/dynamic/public';

export const isOnlineEnabled = () => env.PUBLIC_ONLINE_ENABLED === 'true';
export const getOnlineServerUrl = () => env.PUBLIC_ONLINE_SERVER_URL || 'http://localhost:8080';
