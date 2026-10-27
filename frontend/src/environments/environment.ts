// environment.ts (local development, the proxy handles /api)
export const environment = { apiUrl: '' };

// const isLocal =
//     typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);

// export const environment = {
//     // Locally the dev proxy handles /api; anywhere else use the deployed backend (no trailing slash)
//     apiUrl: isLocal ? '' : 'https://job-tracker-mean-app-zrq3.vercel.app'
// };