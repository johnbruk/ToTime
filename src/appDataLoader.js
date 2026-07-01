import { normalizeAppData } from './appDataShape.js';

export async function loadAppData(options = {}) {
  const repository = options.repository;
  const ensureUserProfile = options.ensureUserProfile;
  const tableError = options.tableError || (() => {});

  if (!repository || typeof repository.loadAll !== 'function') {
    throw new Error('Repository with loadAll is required.');
  }

  if (ensureUserProfile) {
    await ensureUserProfile();
  }

  const result = await repository.loadAll();
  const loadedData = normalizeAppData(result.data || {});
  const errors = result.errors || [];

  errors.forEach(item => tableError(item.table, item.error));

  return { data: loadedData, errors };
}
