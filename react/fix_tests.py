import os
import glob

test_files = glob.glob('src/__tests__/*.ts*')
for f in test_files:
    with open(f, 'r') as file:
        content = file.read()
    
    if 'import { vi } from' not in content:
        content = "import { vi } from 'vitest';\n" + content
        
    content = content.replace('jest.', 'vi.')
    content = content.replace('jest as any', 'vi as any')
    
    with open(f, 'w') as file:
        file.write(content)
