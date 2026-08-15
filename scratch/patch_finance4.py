import re

with open('apps/web/src/pages/Finance.tsx', 'r') as f:
    content = f.read()

# Fix 1: fetchData bug
old_fetch = "} else if (tab === 'ledgers' && selectedLedgerAccount) {"
new_fetch = "} else if (tab === 'ledger-view' && selectedLedgerAccount) {"
content = content.replace(old_fetch, new_fetch)

# Fix 2: Account form opening balance
# Wait, let's see how Account form is defined:
#            ] : tab === 'accounts' ? [
#              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
#              { key: 'accountType', label: 'Account Type', type: 'select' as const, options: [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' }] },

old_account_form = """            ] : tab === 'accounts' ? [
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
              { key: 'accountType', label: 'Account Type', type: 'select' as const, options: [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' }] },"""

new_account_form = """            ] : tab === 'accounts' ? [
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
              { key: 'accountType', label: 'Account Type', type: 'select' as const, options: [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' }] },
              { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },"""

content = content.replace(old_account_form, new_account_form)

# And also for the nested form:
old_nested_form = """          fields={[
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
            { key: 'accountType', label: 'Account Type', type: 'select' as const, options: [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' }] },"""

new_nested_form = """          fields={[
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
            { key: 'accountType', label: 'Account Type', type: 'select' as const, options: [{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Liability' }, { value: 'equity', label: 'Equity' }, { value: 'revenue', label: 'Revenue' }, { value: 'expense', label: 'Expense' }] },
            { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },"""

content = content.replace(old_nested_form, new_nested_form)

with open('apps/web/src/pages/Finance.tsx', 'w') as f:
    f.write(content)
