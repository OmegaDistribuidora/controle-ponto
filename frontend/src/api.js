import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const initialToken =
  typeof window !== "undefined" ? window.localStorage.getItem("controle_ponto_token") || "" : "";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: initialToken ? { Authorization: `Bearer ${initialToken}` } : {}
});

export const setApiToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export default api;
