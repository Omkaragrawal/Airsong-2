import env from '#start/env';
import { defineConfig, drivers } from '@adonisjs/core/encryption';

const encryptionConfig = defineConfig({
  default: 'gcm',

  list: {
    gcm: drivers.aes256gcm({
      /** The first key encrypts; every key is tried when decrypting, so keys can be rotated. */
      keys: [env.get('APP_KEY')],
      id: 'gcm',
    }),
  },
});

export default encryptionConfig;

/**
 * Inferring types for the list of encryptors configured in this application.
 */
declare module '@adonisjs/core/types' {
  // AdonisJS augments its own `EncryptorsList`, which TypeScript only allows with an `interface`.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type
  export interface EncryptorsList extends InferEncryptors<typeof encryptionConfig> {}
}
