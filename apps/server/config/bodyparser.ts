import { defineConfig } from '@adonisjs/core/bodyparser';

const bodyParserConfig = defineConfig({
  /**
   * HTTP methods whose bodies are parsed.
   */
  allowedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],

  /**
   * The "application/x-www-form-urlencoded" parser.
   */
  form: {
    convertEmptyStringsToNull: true,
    types: ['application/x-www-form-urlencoded'],
  },

  /**
   * The JSON parser.
   */
  json: {
    convertEmptyStringsToNull: true,
    types: ['application/json', 'application/json-patch+json', 'application/vnd.api+json', 'application/csp-report'],
  },

  /**
   * The "application/sdp" parser. WHEP offers and answers are raw SDP, read with
   * `request.raw()`, so they are kept as a single raw string rather than parsed.
   */
  raw: {
    types: ['application/sdp'],
  },

  /**
   * The "multipart/form-data" parser. This server takes no file uploads.
   */
  multipart: {
    autoProcess: false,
    convertEmptyStringsToNull: true,
    processManually: [],
    limit: '20mb',
    types: ['multipart/form-data'],
  },
});

export default bodyParserConfig;
