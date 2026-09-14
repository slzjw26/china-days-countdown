/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** 日期时区 - 确定今天的日历日期；中国工作日历在两种时区下都按中国节假日规则计算 */
  "timeZone": "Asia/Shanghai" | "system"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `countdowns` command */
  export type Countdowns = ExtensionPreferences & {}
  /** Preferences accessible in the `create-countdown` command */
  export type CreateCountdown = ExtensionPreferences & {}
  /** Preferences accessible in the `menu-bar` command */
  export type MenuBar = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `countdowns` command */
  export type Countdowns = {}
  /** Arguments passed to the `create-countdown` command */
  export type CreateCountdown = {}
  /** Arguments passed to the `menu-bar` command */
  export type MenuBar = {}
}

