import axios from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL || '';

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('quiz-token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

export function saveSession(data) {
  localStorage.setItem('quiz-token', data.token);
  localStorage.setItem('quiz-user', JSON.stringify(data.user));
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('quiz-user'));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem('quiz-token');
  localStorage.removeItem('quiz-user');
}
