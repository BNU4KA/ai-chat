const { withPodfile } = require('expo/config-plugins');

const MARKER = 'ai-chat-quiet-pods';
const SNIPPET = `
    # ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['GCC_WARN_INHIBIT_ALL_WARNINGS'] = 'YES'
        build_config.build_settings['SWIFT_SUPPRESS_WARNINGS'] = 'YES'
        build_config.build_settings['CLANG_WARN_DOCUMENTATION_COMMENTS'] = 'NO'
      end
    end
`;

module.exports = function withQuietPods(config) {
  return withPodfile(config, (podfile) => {
    const contents = podfile.modResults.contents;
    if (contents.includes(MARKER)) return podfile;
    const hook = /post_install do \|installer\|\n/;
    if (!hook.test(contents)) throw new Error('with-quiet-pods: post_install hook not found in Podfile');
    podfile.modResults.contents = contents.replace(hook, (match) => match + SNIPPET);
    return podfile;
  });
};
