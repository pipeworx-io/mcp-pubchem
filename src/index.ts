interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * PubChem MCP — NIH chemistry compound database (no auth)
 *
 * 100M+ chemical compounds with structures, properties, biological assays,
 * patents, and literature references. Pairs with `openfda` / `rxnorm` for
 * drug research and with `fda` for substance lookups.
 *
 * API: https://pubchemdocs.ncbi.nlm.nih.gov/pug-rest
 * Tools:
 * - search_by_name:    resolve a chemical/drug name to CIDs (PubChem compound IDs)
 * - get_compound:      properties (formula, weight, IUPAC, InChI, SMILES, etc.)
 * - get_synonyms:      all known names for a CID
 * - get_classification: pharmacology classes the compound belongs to
 */


const BASE_URL = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_by_name',
    description:
      'Resolve a common chemical or drug name to PubChem CIDs. Use for "what\'s the CID of ibuprofen?" or to disambiguate. Returns CIDs (Compound IDs) matched to the name. Then use get_compound with the CID for properties.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Common, IUPAC, or brand name (e.g., "ibuprofen", "caffeine")' },
        max_results: { type: 'number', description: 'Cap results (default 5)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_compound',
    description:
      'Get standard properties for a PubChem CID: molecular formula, molecular weight, IUPAC name, canonical SMILES, isomeric SMILES, InChI, InChIKey, exact mass, charge, complexity, H-bond donors/acceptors, rotatable bonds, TPSA, XLogP, heavy atom count.',
    inputSchema: {
      type: 'object',
      properties: {
        cid: { type: 'number', description: 'PubChem Compound ID' },
      },
      required: ['cid'],
    },
  },
  {
    name: 'get_synonyms',
    description: 'List all names (synonyms) for a CID — common names, IUPAC, trade names, CAS numbers, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        cid: { type: 'number', description: 'PubChem Compound ID' },
        max_results: { type: 'number', description: 'Cap (default 50)' },
      },
      required: ['cid'],
    },
  },
  {
    name: 'get_classification',
    description:
      'Pharmacological classification tree for a CID — drug class, mechanism of action, biological role tags. Useful for "what kind of drug is X" questions.',
    inputSchema: {
      type: 'object',
      properties: {
        cid: { type: 'number', description: 'PubChem Compound ID' },
      },
      required: ['cid'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_by_name':
      return searchByName(reqStr(args, 'name', '"aspirin"'), (args.max_results as number) ?? 5);
    case 'get_compound':
      return getCompound(reqNum(args, 'cid', '2244 (aspirin)'));
    case 'get_synonyms':
      return getSynonyms(reqNum(args, 'cid', '2244'), (args.max_results as number) ?? 50);
    case 'get_classification':
      return getClassification(reqNum(args, 'cid', '2244'));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function reqStr(args: Record<string, unknown>, key: string, example: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) {
    throw new Error(`Required argument "${key}" is missing or empty. Pass a string like ${example}.`);
  }
  return v;
}

function reqNum(args: Record<string, unknown>, key: string, example: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Required argument "${key}" must be a number. Example: ${example}.`);
  }
  return v;
}

async function pcFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Accept: 'application/json' } });
  if (res.status === 404) throw new Error('PubChem: not found (HTTP 404)');
  if (res.status === 503) throw new Error('PubChem: service busy (HTTP 503) — retry shortly');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PubChem error: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function searchByName(name: string, maxResults: number) {
  const data = await pcFetch<{ IdentifierList?: { CID?: number[] } }>(
    `/compound/name/${encodeURIComponent(name)}/cids/JSON`,
  );
  const cids = (data.IdentifierList?.CID ?? []).slice(0, Math.max(1, maxResults));
  return {
    name,
    count: cids.length,
    cids,
    pubchem_urls: cids.map((c) => `https://pubchem.ncbi.nlm.nih.gov/compound/${c}`),
  };
}

interface PubChemProperty {
  CID?: number;
  MolecularFormula?: string;
  MolecularWeight?: number | string;
  IUPACName?: string;
  CanonicalSMILES?: string;
  IsomericSMILES?: string;
  InChI?: string;
  InChIKey?: string;
  ExactMass?: number | string;
  MonoisotopicMass?: number | string;
  Charge?: number;
  Complexity?: number;
  HBondDonorCount?: number;
  HBondAcceptorCount?: number;
  RotatableBondCount?: number;
  TPSA?: number;
  XLogP?: number;
  HeavyAtomCount?: number;
}

async function getCompound(cid: number) {
  const props =
    'MolecularFormula,MolecularWeight,IUPACName,CanonicalSMILES,IsomericSMILES,InChI,InChIKey,ExactMass,MonoisotopicMass,Charge,Complexity,HBondDonorCount,HBondAcceptorCount,RotatableBondCount,TPSA,XLogP,HeavyAtomCount';
  const data = await pcFetch<{ PropertyTable?: { Properties?: PubChemProperty[] } }>(
    `/compound/cid/${cid}/property/${props}/JSON`,
  );
  const p = data.PropertyTable?.Properties?.[0];
  if (!p) throw new Error(`PubChem: no properties for CID ${cid}`);
  return {
    cid: p.CID ?? cid,
    molecular_formula: p.MolecularFormula ?? null,
    molecular_weight: p.MolecularWeight != null ? Number(p.MolecularWeight) : null,
    iupac_name: p.IUPACName ?? null,
    canonical_smiles: p.CanonicalSMILES ?? null,
    isomeric_smiles: p.IsomericSMILES ?? null,
    inchi: p.InChI ?? null,
    inchikey: p.InChIKey ?? null,
    exact_mass: p.ExactMass != null ? Number(p.ExactMass) : null,
    monoisotopic_mass: p.MonoisotopicMass != null ? Number(p.MonoisotopicMass) : null,
    charge: p.Charge ?? null,
    complexity: p.Complexity ?? null,
    h_bond_donors: p.HBondDonorCount ?? null,
    h_bond_acceptors: p.HBondAcceptorCount ?? null,
    rotatable_bonds: p.RotatableBondCount ?? null,
    tpsa: p.TPSA ?? null,
    xlogp: p.XLogP ?? null,
    heavy_atom_count: p.HeavyAtomCount ?? null,
    pubchem_url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
  };
}

async function getSynonyms(cid: number, maxResults: number) {
  const data = await pcFetch<{ InformationList?: { Information?: { CID?: number; Synonym?: string[] }[] } }>(
    `/compound/cid/${cid}/synonyms/JSON`,
  );
  const all = data.InformationList?.Information?.[0]?.Synonym ?? [];
  return {
    cid,
    total: all.length,
    synonyms: all.slice(0, Math.max(1, maxResults)),
  };
}

async function getClassification(cid: number) {
  // PUG-VIEW (different endpoint family) has the pharmacology classification
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=Pharmacology+and+Biochemistry`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return { cid, classifications: [] };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PubChem (view) error: ${res.status} ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    Record?: {
      Section?: {
        TOCHeading?: string;
        Section?: {
          TOCHeading?: string;
          Information?: { Name?: string; Value?: { StringWithMarkup?: { String?: string }[] } }[];
        }[];
      }[];
    };
  };

  const sections = data.Record?.Section?.[0]?.Section ?? [];
  const out: Record<string, string[]> = {};
  for (const s of sections) {
    const heading = s.TOCHeading ?? 'Other';
    const values: string[] = [];
    for (const info of s.Information ?? []) {
      for (const swm of info.Value?.StringWithMarkup ?? []) {
        if (swm.String) values.push(swm.String);
      }
    }
    if (values.length > 0) out[heading] = values;
  }
  return {
    cid,
    pharmacology_sections: out,
    pubchem_url: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}#section=Pharmacology-and-Biochemistry`,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
