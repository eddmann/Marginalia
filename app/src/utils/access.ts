import { isWebAppPlatform } from '@/services/environment';

export const getAccessToken = async (): Promise<string | null> => {
  if (isWebAppPlatform()) {
    return localStorage.getItem('token') ?? null;
  }
  return null;
};

export const getUserID = async (): Promise<string | null> => {
  if (isWebAppPlatform()) {
    const user = localStorage.getItem('user') ?? '{}';
    return JSON.parse(user).id ?? null;
  }
  return null;
};
