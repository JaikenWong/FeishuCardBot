const DEFAULT_FIELD_MAP = {
  material_name: 'materialName',
  project_number: 'projectNumber',
  library: 'library',
  view: 'view',
  folder: 'folder',
  category: 'category',
}

function pickRequiredFieldNames(schema = {}) {
  return (schema.fields || []).filter((f) => f.required).map((f) => f.name)
}

function validateRequiredValues(formValue = {}, required = []) {
  const missing = required.filter((k) => {
    const v = formValue[k]
    return v == null || String(v).trim() === ''
  })
  return { ok: missing.length === 0, missing }
}

function mapToPartData(formValue = {}, fieldMap = DEFAULT_FIELD_MAP) {
  const out = {}
  for (const [k, v] of Object.entries(formValue)) {
    const target = fieldMap[k]
    if (!target) continue
    out[target] = typeof v === 'string' ? v.trim() : v
  }
  return out
}

function parseSubmitForm(formValue = {}, schema = {}, fieldMap = DEFAULT_FIELD_MAP) {
  const required = pickRequiredFieldNames(schema)
  const check = validateRequiredValues(formValue, required)
  const partData = mapToPartData(formValue, fieldMap)
  return {
    ok: check.ok,
    missing: check.missing,
    required,
    partData,
  }
}

module.exports = {
  DEFAULT_FIELD_MAP,
  pickRequiredFieldNames,
  validateRequiredValues,
  mapToPartData,
  parseSubmitForm,
}
