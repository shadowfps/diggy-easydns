import pkg from '../../package.json' with { type: 'json' };

/*
 * Für /api/health: die Version aus package.json und der Commit, aus dem das
 * Image gebaut ist (Dockerfile, DIGGY_COMMIT aus der CI). tsc legt eine Kopie
 * von package.json nach dist-server/ — der Pfad stimmt im Quelltext wie im
 * Kompilat.
 */
const commit = process.env.DIGGY_COMMIT?.trim().slice(0, 7);

export const BUILD_INFO: { version: string; commit?: string } = commit
  ? { version: pkg.version, commit }
  : { version: pkg.version };
