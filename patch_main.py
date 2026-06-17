import re

with open("js/main.js", "r") as f:
    content = f.read()

# Requirement 1: Remove readonly class from .col-panel
content = content.replace(
    'h += \'<div class="col-panel\' + (isEditable ? \'\' : \' readonly\') + \'" data-slot="\' + i + \'" data-editable="\' + isEditable + \'">\';',
    'h += \'<div class="col-panel" data-slot="\' + i + \'" data-editable="\' + isEditable + \'">\';'
)

# Requirement 2.1: Add col-edit-btn
submit_area_old = """        h += '<div class="submit-area" id="act10-submit-' + i + '">';
        h += '<button class="submit-btn" data-slot="' + i + '">提交行动</button>';
        h += '<span class="submit-hint" id="act10-hint-' + i + '">选满2个行动额度后提交</span>';
        h += '<div class="val-toast" id="act10-toast-' + i + '"></div>';
        h += '</div>';"""

submit_area_new = """        h += '<div class="submit-area" id="act10-submit-' + i + '">';
        h += '<button class="submit-btn" data-slot="' + i + '">提交行动</button>';
        h += '<button class="col-edit-btn" data-slot="' + i + '">📝 修改行动</button>';
        h += '<span class="submit-hint" id="act10-hint-' + i + '">选满2个行动额度后提交</span>';
        h += '<div class="val-toast" id="act10-toast-' + i + '"></div>';
        h += '</div>';"""

content = content.replace(submit_area_old, submit_area_new)

with open("js/main.js", "w") as f:
    f.write(content)
