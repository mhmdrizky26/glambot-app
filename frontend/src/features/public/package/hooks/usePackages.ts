'use client';

import { useEffect, useState } from 'react';
import { fetchPackages, type Package } from '../api/packageApi';

export function usePackages() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPackages()
      .then((data) => {
        setPackages(data);
      })
      .catch((err) => {
        setError(err.message ?? 'Failed to fetch packages');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { packages, loading, error };
}
