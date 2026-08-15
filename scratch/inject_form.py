with open('scratch/HR_EmployeeForm.txt', 'r') as f:
    old_form = f.read()

with open('scratch/HR_EmployeeForm_new.txt', 'r') as f:
    new_form = f.read()

with open('apps/web/src/pages/HR.tsx', 'r') as f:
    hr_content = f.read()

hr_content = hr_content.replace(old_form, new_form)

with open('apps/web/src/pages/HR.tsx', 'w') as f:
    f.write(hr_content)
