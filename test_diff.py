import sys
with open('before_wc.txt', 'r') as f:
    before = f.read()
with open('after_wc.txt', 'r') as f:
    after = f.read()
print("Before:\n", before)
print("After:\n", after)
