/* eslint-disable @typescript-eslint/no-require-imports */
const { withPodfile } = require('@expo/config-plugins');

const startTag = '# --- RN-MLKIT-OCR CONFIG ---';
const endTag = '# --- END RN-MLKIT-OCR CONFIG ---';

module.exports = function withMlKitOcrIos(config) {
  return withPodfile(config, (podfileConfig) => {
    const replacement = `${startTag}\n$ReactNativeOcrSubspecs = ['latin', 'japanese']\n${endTag}`;
    const pattern = /# --- RN-MLKIT-OCR CONFIG ---[\s\S]*?# --- END RN-MLKIT-OCR CONFIG ---/;

    if (pattern.test(podfileConfig.modResults.contents)) {
      podfileConfig.modResults.contents = podfileConfig.modResults.contents.replace(pattern, replacement);
    } else {
      podfileConfig.modResults.contents = `${replacement}\n\n${podfileConfig.modResults.contents}`;
    }
    return podfileConfig;
  });
};
