import { useMutation } from '@tanstack/react-query';
import { verifyJiraCredentials } from './connection-api';

export function useVerifyCredentialsMutation() {
  return useMutation({ mutationFn: verifyJiraCredentials, retry: false });
}
