import re

with open('src/__tests__/context.spec.tsx', 'r') as f:
    content = f.read()

content = content.replace("vi.mock('@erghi/sdk');", """vi.mock('@erghi/sdk', () => {
  const mockClient = vi.fn();
  return {
    default: mockClient,
    ErghiClient: mockClient,
  };
});""")

with open('src/__tests__/context.spec.tsx', 'w') as f:
    f.write(content)
