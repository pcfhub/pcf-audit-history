/**
 * What an `action` code is called. The platform's own formatted value wins
 * when it sent one — it is localised, and the table below is not — and the
 * table covers the codes Learn documents under *Table row events*, *Record
 * sharing events* and *Many-to-many relationship events*. Anything else
 * reads as "Action {0}", which is honest rather than blank.
 */

/** Code → the suffix of the `.resx` key (`AuditHistory_Action<Suffix>`). */
const ACTION_KEYS: Record<number, string> = {
    1: 'Create',
    2: 'Update',
    3: 'Delete',
    12: 'Merge',
    13: 'Assign',
    14: 'Share',
    33: 'Associate',
    34: 'Disassociate',
    41: 'SetState',
    48: 'ModifyShare',
    49: 'Unshare',
    53: 'Associate',
    54: 'Disassociate',
    55: 'Associate',
    56: 'Disassociate',
};

export type GetString = (key: string) => string;

export function actionLabel(code: number, formatted: string, getString: GetString): string {
    if (formatted !== '') {
        return formatted;
    }

    const suffix = ACTION_KEYS[code];

    return suffix
        ? getString(`AuditHistory_Action${suffix}`)
        : getString('AuditHistory_ActionOther').replace('{0}', String(code));
}

/** Whether a code is one whose detail carries old and new column values. */
export function isDataChange(code: number): boolean {
    return code === 1 || code === 2 || code === 3 || code === 12 || code === 13 || code === 41;
}
