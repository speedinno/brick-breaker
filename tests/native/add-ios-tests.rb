# CI-only target generation. The compiled game artifact replaces the target app
# before test-without-building; this never ships a test switch in the game.
require 'xcodeproj'
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |t| t.name == 'App' }
raise 'App target is missing' unless app
target = project.new_target(:ui_test_bundle, 'NativeVerification', :ios, '15.4', nil, :swift)
target.add_dependency(app)
target.build_configurations.each do |configuration|
  configuration.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.speedinno.brickbreaker.verification',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'TEST_TARGET_NAME' => 'App',
    'CODE_SIGNING_ALLOWED' => 'NO',
    'TARGETED_DEVICE_FAMILY' => '1,2'
  })
end
source = project.main_group.new_file(File.expand_path('tests/native/NativeSmoke.swift'))
target.source_build_phase.add_file_reference(source)
project.root_object.attributes['TargetAttributes'] ||= {}
project.root_object.attributes['TargetAttributes'][target.uuid] = {'TestTargetID' => app.uuid}
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, target, launch_target: true)
scheme.save_as(project.path, 'NativeVerification', true)
