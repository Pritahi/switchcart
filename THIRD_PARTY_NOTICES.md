# Third-party notices

SwitchCart's original project code is released under the MIT license in `LICENSE`. Dependencies are not vendored in the source ZIP; `package-lock.json` identifies the versions installed by npm. Each dependency retains its own license and copyright notices in its distributed package. Review the installed packages and their transitive dependencies before redistributing a bundled application.

## Principal software components

| Component | License | Project / license source |
| --- | --- | --- |
| Node.js | MIT and bundled-component licenses | https://github.com/nodejs/node/blob/main/LICENSE |
| Express | MIT | https://github.com/expressjs/express/blob/master/LICENSE |
| Next.js | MIT | https://github.com/vercel/next.js/blob/canary/license.md |
| React / React DOM | MIT | https://github.com/facebook/react/blob/main/LICENSE |
| Drizzle ORM / Drizzle Kit | Apache-2.0 | https://github.com/drizzle-team/drizzle-orm/blob/main/LICENSE |
| node-postgres | MIT | https://github.com/brianc/node-postgres/blob/master/LICENSE |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE |
| PostCSS | MIT | https://github.com/postcss/postcss/blob/main/LICENSE |
| Lucide | ISC | https://github.com/lucide-icons/lucide/blob/main/LICENSE |
| fflate | MIT | https://github.com/101arrowz/fflate/blob/master/LICENSE |
| tsx | MIT | https://github.com/esbuild-kit/tsx/blob/develop/LICENSE |
| dotenv | BSD-2-Clause | https://github.com/motdotla/dotenv/blob/master/LICENSE |
| TypeScript | Apache-2.0 | https://github.com/microsoft/TypeScript/blob/main/LICENSE |
| ESLint | MIT | https://github.com/eslint/eslint/blob/main/LICENSE |
| PostgreSQL | PostgreSQL License | https://www.postgresql.org/about/licence/ |

## Fonts and artwork

Inter and Space Grotesk are requested from Google Fonts at runtime; their font projects use the SIL Open Font License. Font binaries are not included in the source archive. See https://github.com/rsms/inter/blob/master/LICENSE.txt and https://github.com/floriankarsten/space-grotesk/blob/master/OFL.txt. System-font fallbacks work without Google Fonts.

Product illustrations are CSS gradients and Lucide SVG icons. No stock photography, copyrighted music or third-party product photography is included.

## PayPal marks and demo video

PayPal names and marks belong to their respective owners. Their use in code to identify API integration does not itself establish permission for all promotional uses. The hackathon rules restrict third-party trademarks and copyrighted material without permission. Ask the organizers which PayPal marks are permitted in the public video and follow current PayPal brand guidelines. Do not add unrelated logos or music merely because the event is sponsored by PayPal.

## External services

PayPal, OpenAI-compatible providers, Google Fonts, GitHub, Render and Railway are external services governed by their own terms. This repository does not grant rights to those services or include their credentials. The application can run its labeled offline payment simulator and deterministic catalog fallback without contacting PayPal or a model provider.
