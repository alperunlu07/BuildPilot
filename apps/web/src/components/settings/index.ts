// Barrel for the settings page primitives. Ported from
// docs/designs/extras.css + docs/designs/settings.jsx so each section
// composes the same Group / Row / Banner / Table / Code building blocks.

export { SettingsGroup, type SettingsGroupProps } from './SettingsGroup';
export { SettingsRow, type SettingsRowProps } from './SettingsRow';
export {
  SettingsBanner,
  type SettingsBannerKind,
  type SettingsBannerProps,
} from './SettingsBanner';
export {
  SettingsTable,
  SettingsTableRow,
  type SettingsTableColumn,
  type SettingsTableProps,
  type SettingsTableRowProps,
} from './SettingsTable';
export { SettingsCode, type SettingsCodeProps } from './SettingsCode';
