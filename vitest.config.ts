import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Az integrációs tesztek közös adatbázist használnak, ezért a fájlok egymás után futnak.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
