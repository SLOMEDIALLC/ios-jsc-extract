#!/usr/bin/env ruby
# Generates a minimal iOS App Xcode project using xcodeproj gem.
# Usage: ruby gen_xcode_app.rb <source_dir> <output_dir>
#   source_dir: directory containing AppDelegate.swift and Info.plist
#   output_dir: directory where iOSExtract.xcodeproj will be created

require 'xcodeproj'
require 'fileutils'

src_dir = ARGV[0] || '.'
out_dir = ARGV[1] || '.'

FileUtils.mkdir_p(out_dir)

proj_path = File.join(out_dir, 'iOSExtract.xcodeproj')
proj = Xcodeproj::Project.new(proj_path)

# Create target
target = proj.new_target(:application, 'iOSExtract', :ios, '16.0')

# Main group
main_group = proj.main_group.new_group('iOSExtract', src_dir)

# Add AppDelegate.swift
swift_ref = main_group.new_file(File.join(src_dir, 'AppDelegate.swift'))
target.source_build_phase.add_file_reference(swift_ref)

# Add Info.plist (resource)
plist_ref = main_group.new_file(File.join(src_dir, 'Info.plist'))

# Build settings
['Debug', 'Release'].each do |config|
  settings = target.build_settings(config)
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.test.iosextract'
  settings['INFOPLIST_FILE'] = File.join(src_dir, 'Info.plist')
  settings['SWIFT_VERSION'] = '5.9'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
  settings['SDKROOT'] = 'iphoneos'
  settings['TARGETED_DEVICE_FAMILY'] = '1'
  # Disable code signing for simulator
  settings['CODE_SIGN_IDENTITY'] = ''
  settings['CODE_SIGN_STYLE'] = 'Manual'
  settings['CODE_SIGNING_REQUIRED'] = 'NO'
  settings['CODE_SIGNING_ALLOWED'] = 'NO'
end

proj.save
puts "Generated #{proj_path}"
