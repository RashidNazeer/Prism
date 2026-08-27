/* ════════════════════════════════════════════════════════════════
   Access control

   Every gate in the app answers to one of the keys below. A role sets
   the starting point; anything Asad flips for a person is stored on
   that person as an override and wins over their role. Nothing here is
   read from localStorage: the grants live in app_users.custom_perms in
   Supabase, so a permission given on one machine is a permission
   everywhere, and it survives every deploy.

   The six original keys (canAdd, canEdit, canDelete, canSeeHiredBy,
   canEditVideos, canSetDeadline) keep their names on purpose - they are
   already wired through hundreds of lines of the app, and renaming them
   would silently drop every override already saved against them.
   ════════════════════════════════════════════════════════════════ */

export const CAP_GROUPS = [
  {
    group: 'Creators',
    note: 'What someone can do to a creator row',
    caps: [
      { key: 'canAdd',          label: 'Add creators',            help: 'Create new rows in a brand' },
      { key: 'canEdit',         label: 'Edit creators',           help: 'Change name, handle, deal, dates' },
      { key: 'canDelete',       label: 'Delete creators',         help: 'Remove rows permanently' },
      { key: 'canEditVideos',   label: 'Edit videos and ad codes', help: 'Paste TikTok links and #adcodes' },
      { key: 'canSetDeadline',  label: 'Set deadlines',           help: 'Give a creator a delivery date' },
      { key: 'canSeeHiredBy',   label: 'See who hired',           help: 'The A / M / E / K tags and column' },
      { key: 'canBulkEdit',     label: 'Use bulk actions',        help: 'Select many rows and act on all of them' },
    ],
  },
  {
    group: 'Money',
    note: 'The commercial figures',
    caps: [
      { key: 'canSeeMoney',     label: 'See deal values',         help: 'Allocated, paid and still owed' },
      { key: 'canEditPay',      label: 'Change payment status',   help: 'Mark a creator paid or unpaid' },
      { key: 'canSeeGmv',       label: 'See GMV and ad spend',    help: 'Revenue figures across the app' },
    ],
  },
  {
    group: 'Sections',
    note: 'Which tabs appear at the top',
    caps: [
      { key: 'tabBrands',       label: 'Brands tab' },
      { key: 'tabCreators',     label: 'Creators tab' },
      { key: 'tabPerformance',  label: 'Performance tab' },
      { key: 'tabReporting',    label: 'Reporting tab' },
      { key: 'tabLeaderboard',  label: 'Leaderboard tab' },
      { key: 'tabDiscovery',    label: 'Discovery tab' },
    ],
  },
  {
    group: 'Reporting',
    note: 'The executive report and the angle test',
    caps: [
      { key: 'canExportCsv',    label: 'Export CSV',              help: 'Download the report as a spreadsheet' },
      { key: 'canPrintReport',  label: 'Print the report',        help: 'Produce the PDF' },
      { key: 'canEditAngles',   label: 'Run creative angle tests', help: 'Create, rename and delete angles, and file videos into them' },
      { key: 'canEditAdSpend',  label: 'Type ad spend and GMV',   help: 'Enter the figures no API provides' },
    ],
  },
  {
    group: 'Discovery',
    note: 'The outreach pipeline',
    caps: [
      { key: 'canMarkDiscovery', label: 'Mark discovered creators', help: 'Move creators through the tiers' },
      { key: 'canEditOutreach',  label: 'Change outreach status',   help: 'Contacted, under review, rejected' },
    ],
  },
  {
    group: 'Brands',
    note: 'The brand list itself',
    caps: [
      { key: 'canAddBrand',     label: 'Add a brand' },
      { key: 'canRenameBrand',  label: 'Rename or reorder brands' },
      { key: 'canDeleteBrand',  label: 'Delete or merge brands',  help: 'Destructive · takes every deal with it' },
      { key: 'canEditContracts', label: 'Edit contracts',         help: 'Global brand contracts and creator terms' },
    ],
  },
  {
    group: 'Administration',
    note: 'The keys to the workspace',
    caps: [
      { key: 'canManageUsers',  label: 'Manage users',            help: 'Create accounts, set roles, reset passwords' },
      { key: 'canGrantAccess',  label: 'Grant access',            help: 'Open this panel and change what others can do' },
      { key: 'canSeeLogs',      label: 'See activity logs',       help: 'The workspace audit trail' },
      { key: 'canGodMode',      label: 'God Mode',                help: 'Appearance, navigation, columns, brand surgery' },
      { key: 'canSqlQuest',     label: 'SQL Quest' },
      { key: 'canCompareBrands', label: 'Compare brands' },
      { key: 'canManageTeam',   label: 'Manage the hired-by team' },
    ],
  },
];

export const ALL_CAPS = CAP_GROUPS.reduce((a, g) => a.concat(g.caps.map(c => c.key)), []);
export const CAP_INFO = CAP_GROUPS.reduce((m, g) => {
  g.caps.forEach(c => { m[c.key] = { ...c, group: g.group }; });
  return m;
}, {});

const yes = (keys) => keys.reduce((m, k) => { m[k] = true; return m; }, {});
const everything = yes(ALL_CAPS);

/* Where each role starts. A role is a shape, not a cage: anything here
   can be overridden per person. */
export const ROLE_CAPS = {
  superadmin: everything,

  ipc: {
    ...yes([
      'canAdd', 'canEdit', 'canEditVideos', 'canBulkEdit',
      'canSeeMoney', 'canEditPay', 'canSeeGmv',
      'tabBrands', 'tabCreators', 'tabPerformance', 'tabReporting', 'tabLeaderboard', 'tabDiscovery',
      'canExportCsv', 'canPrintReport', 'canEditAngles', 'canEditAdSpend',
      'canMarkDiscovery', 'canEditOutreach',
      'canAddBrand', 'canEditContracts',
    ]),
  },

  admin: {
    ...yes([
      'canAdd', 'canEdit', 'canSetDeadline', 'canBulkEdit',
      'canSeeMoney', 'canEditPay', 'canSeeGmv',
      'tabBrands', 'tabCreators', 'tabPerformance', 'tabReporting', 'tabLeaderboard', 'tabDiscovery',
      'canExportCsv', 'canPrintReport',
      'canMarkDiscovery', 'canEditOutreach',
      'canAddBrand', 'canRenameBrand', 'canEditContracts',
      'canSeeLogs', 'canCompareBrands', 'canManageTeam',
    ]),
  },

  apc: {
    ...yes([
      'canSeeHiredBy', 'canSeeMoney', 'canSeeGmv',
      'tabBrands', 'tabCreators', 'tabPerformance',
    ]),
  },

  viewer: {
    ...yes([
      'canSeeHiredBy', 'canSeeMoney', 'canSeeGmv',
      'tabBrands', 'tabCreators', 'tabPerformance', 'tabReporting', 'tabLeaderboard',
      'canExportCsv', 'canPrintReport',
    ]),
  },

  client: {
    ...yes(['canSeeGmv', 'tabBrands', 'tabReporting', 'canPrintReport']),
  },
};

export const ROLE_LIST = ['superadmin', 'ipc', 'admin', 'apc', 'viewer', 'client'];

export function defaultFor(role, key) {
  const r = ROLE_CAPS[role] || ROLE_CAPS.viewer;
  return !!r[key];
}

/* The one question the whole app asks. */
export function can(user, key) {
  if (!user) return false;
  const cp = user.custom_perms || user.customPerms || null;
  if (cp && Object.prototype.hasOwnProperty.call(cp, key)) return !!cp[key];
  return defaultFor(user.role, key);
}

/* What a person actually ends up with, role plus overrides, for showing
   a count without asking twenty separate questions. */
export function grantedCount(user) {
  return ALL_CAPS.filter(k => can(user, k)).length;
}

export function overrideCount(user) {
  const cp = (user && (user.custom_perms || user.customPerms)) || {};
  return Object.keys(cp).filter(k => ALL_CAPS.indexOf(k) >= 0).length;
}
