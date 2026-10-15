import axios from 'axios';

// one instance for the whole app, cookies ride along so the refresh token works from a fresh page load
const api = axios.create({ baseURL: '/api/v1', withCredentials: true });

export default api;
