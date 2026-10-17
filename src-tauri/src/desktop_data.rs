//! Desktop data operations. Battle formulas and trait runtime stay in Python.
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

pub type Result<T> = std::result::Result<T, String>;
pub fn text(v: &Value) -> &str {
    v.as_str().unwrap_or("")
}
pub fn truth(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}
fn array(v: &Value) -> &[Value] {
    v.as_array().map(Vec::as_slice).unwrap_or(&[])
}

fn trigger_affects_power(option: &Value) -> bool {
    fn numeric(value: &Value) -> Option<f64> {
        match value {
            Value::Bool(b) => Some(if *b { 1.0 } else { 0.0 }),
            Value::Number(n) => n.as_f64(),
            Value::String(s) => {
                let s = s.trim();
                if let Some(percent) = s.strip_suffix('%') {
                    percent.trim().parse::<f64>().ok().map(|n| n / 100.0)
                } else {
                    s.parse::<f64>().ok()
                }
            }
            _ => None,
        }
    }
    let table = array(&option["skill_power_by_count"]);
    if let Some(first) = table.first() {
        return table
            .iter()
            .skip(1)
            .any(|value| numeric(value) != numeric(first));
    }
    // OCR power cannot identify combo, usage, cost or damage-only stacks.
    [
        ("skill_power_plus", 0.0),
        ("skill_power_mul", 1.0),
        ("power_multiplier", 0.0),
        ("power_multiplier_plus", 0.0),
        ("power_multiplier_mul", 1.0),
        ("mini_advantage_plus", 0.0),
        ("mini_advantage_mul", 1.0),
    ]
    .iter()
    .any(|(key, identity)| numeric(&option[*key]).is_some_and(|value| value != *identity))
}
fn integer(v: &Value) -> i64 {
    v.as_i64()
        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
        .unwrap_or(0)
}
fn string_default(v: &Value, fallback: &str) -> String {
    if truth(v) {
        text(v).trim().to_owned()
    } else {
        fallback.to_owned()
    }
}
fn label(p: &Value) -> String {
    format!("{}{}", text(&p["id"]), text(&p["name"]))
}
fn load(path: &Path, fallback: Value) -> Result<Value> {
    if !path.exists() {
        return Ok(fallback);
    }
    let source = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(source.trim_start_matches('\u{feff}'))
        .map_err(|e| format!("{}: {e}", path.display()))
}
fn save(path: &Path, value: &Value) -> Result<()> {
    std::fs::create_dir_all(path.parent().ok_or("Invalid data path")?)
        .map_err(|e| e.to_string())?;
    std::fs::write(
        path,
        serde_json::to_string_pretty(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}
fn json_files(path: &Path) -> Result<Vec<PathBuf>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let mut files = std::fs::read_dir(path)
        .map_err(|e| format!("{}: {e}", path.display()))?
        .map(|e| e.map(|e| e.path()).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>>>()?;
    files.retain(|p| {
        p.is_file()
            && p.extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("json"))
    });
    files.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
    Ok(files)
}
fn trait_files(path: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.is_dir() {
            trait_files(&path, out)?;
        } else if path.extension().is_some_and(|s| s == "json") {
            out.push(path);
        }
    }
    Ok(())
}

pub struct DesktopData {
    pub root: PathBuf,
    pub user: PathBuf,
    pets: Vec<Value>,
    skills: Vec<Value>,
    traits: Vec<Value>,
    loaded: bool,
}
impl DesktopData {
    pub fn new(root: PathBuf, user: PathBuf) -> Self {
        Self {
            root,
            user,
            pets: vec![],
            skills: vec![],
            traits: vec![],
            loaded: false,
        }
    }
    fn data(&self) -> PathBuf {
        self.root.join("data")
    }
    fn ensure_loaded(&mut self) -> Result<()> {
        if self.loaded {
            return Ok(());
        }
        let mut traits = vec![];
        trait_files(&self.data().join("pets_trait_json"), &mut traits)?;
        let traits: Vec<_> = traits
            .iter()
            .filter_map(|p| load(p, Value::Null).ok())
            .filter(|v| v["特性"].is_object())
            .collect();
        let mut pets = vec![];
        for path in json_files(&self.data().join("pets_w_skill_json"))? {
            if let Ok(mut p) = load(&path, Value::Null) {
                if !p.is_object() {
                    continue;
                }
                if !p["特性"].is_object() {
                    let name = text(&p["特性"]).trim();
                    if let Some(t) = traits.iter().find(|t| text(&t["特性"]["名称"]) == name) {
                        p["特性"] = t["特性"].clone();
                    }
                }
                pets.push(p);
            }
        }
        let mut skills = vec![];
        for path in json_files(&self.data().join("skills_database"))? {
            let data = load(&path, json!([]))?;
            if let Some(items) = data.as_array() {
                skills.extend(items.iter().cloned());
            } else if data.is_object() {
                skills.push(data);
            }
        }
        self.pets = pets;
        self.skills = skills;
        self.traits = traits;
        self.loaded = true;
        Ok(())
    }
    fn find(&self, query: &str) -> Option<&Value> {
        self.pets
            .iter()
            .find(|p| label(p) == query)
            .or_else(|| self.pets.iter().find(|p| text(&p["name"]) == query))
            .or_else(|| {
                self.pets.iter().find(|p| match &p["other_name"] {
                    Value::Object(o) => o.iter().any(|(k, v)| k == query || text(v) == query),
                    Value::Array(a) => a.iter().any(|v| text(v) == query),
                    _ => false,
                })
            })
    }
    fn final_form(&self, p: &Value) -> bool {
        if text(&p["evolution"]["stage"]) == "mega" {
            return false;
        }
        array(&p["evolution"]["next"])
            .iter()
            .filter(|n| truth(n))
            .all(|n| {
                // SpiritFinder's evolution fallback also accepts an obsolete numeric prefix.
                let q = text(n);
                let next = self
                    .find(q)
                    .or_else(|| self.find(q.trim_start_matches(|c: char| c.is_ascii_digit())));
                next.is_none_or(|p| text(&p["evolution"]["stage"]) == "mega")
            })
    }
    fn pet_summary(&self, p: &Value) -> Value {
        let t = &p["特性"];
        let name = if t.is_object() {
            text(&t["名称"])
        } else {
            text(t)
        };
        let mut result = json!({"id":p.get("id").unwrap_or(&json!("")), "name":p.get("name").unwrap_or(&json!("")), "label":label(p),
            "elements":p.get("elements").unwrap_or(&json!([])), "race":p["种族资质"],
            "traitName":name,"traitEffect":text(&t["效果"]),"evolutionStage":p["evolution"].get("stage").unwrap_or(&json!("")),
            "nextForms":p["evolution"].get("next").unwrap_or(&json!([])),"prevForms":p["evolution"].get("prev").unwrap_or(&json!([])),"evolutionChain":p["evolution"].get("chain").unwrap_or(&json!([])),
            "skillCount":array(&p["skills"]).len(),"isFinal":self.final_form(p)});
        for key in ["hp", "atk", "mag", "def", "res", "spd"] {
            result[key] = p[key].clone();
        }
        result
    }
    fn sorted_pets(&self, desc: bool) -> Vec<&Value> {
        let mut pets: Vec<_> = self
            .pets
            .iter()
            .filter(|p| !text(&p["name"]).is_empty())
            .collect();
        pets.sort_by_key(|p| {
            (
                text(&p["id"]).parse::<i64>().unwrap_or(1_000_000_000),
                text(&p["name"]),
            )
        });
        if desc {
            pets.reverse();
        }
        pets
    }
    fn presets(&self) -> Result<Value> {
        let path = self.user.join("presets.json");
        let mut p = load(&path, load(&self.data().join("presets.json"), json!({}))?)?;
        if !path.exists() {
            let o = p.as_object_mut().ok_or("Invalid presets")?;
            o.entry("attackers").or_insert(json!({}));
            o.entry("defenders").or_insert(json!({}));
        }
        Ok(p)
    }
    fn preset_groups(&self, presets: &Value) -> Value {
        let mut groups = vec![];
        if let Some(p) = presets.as_object() {
            for (group, items) in p {
                let Some(items) = items.as_object() else {
                    continue;
                };
                let items: Vec<_> = items.iter().map(|(key,v)| {
                    let mut item = json!({"key":key,"name":v.get("name").unwrap_or(&json!(key)),"id":v.get("id").unwrap_or(&json!("")),
                        "skills":v.get("skills").unwrap_or(&json!([])),"trait_triggered":truth(&v["trait_triggered"]),
                        "trait_stacks":integer(&v["trait_stacks"]),"trait_choices":v.get("trait_choices").unwrap_or(&json!({})),
                        "devolution":integer(&v["devolution"]),"mega":truth(&v["mega"]),"skillCount":array(&v["skills"]).len()});
                    for k in ["iv","personality_bouns","personality_down","bloodline","trait_override_query","mega_form"] { item[k] = v[k].clone(); }
                    item
                }).collect();
                groups.push(json!({"name":group,"items":items}));
            }
        }
        json!(groups)
    }
    fn configs(&self) -> Result<Value> {
        let mut defaults = load(&self.data().join("configs.json"), json!({}))?;
        let user = load(&self.user.join("configs.json"), json!({}))?;
        for (k, v) in user.as_object().ok_or("Invalid configs")? {
            if let (Some(target), Some(values)) = (defaults[k].as_object_mut(), v.as_object()) {
                target.extend(values.clone());
            } else {
                defaults[k] = v.clone();
            }
        }
        Ok(defaults)
    }
    fn summary(&self) -> Result<Value> {
        let presets = self.presets()?;
        let teams = load(
            &self.user.join("teams.json"),
            load(&self.data().join("teams.json"), json!({}))?,
        )?;
        Ok(json!({"dataDir":self.data(),"userDataDir":self.user,
            "petCount":json_files(&self.data().join("pets_w_skill_json"))?.len(),
            "skillFileCount":json_files(&self.data().join("skills_database"))?.len(),
            "presetGroups":presets.as_object().into_iter().flatten().map(|(k,v)| json!({"name":k,"count":v.as_object().map_or(0,Map::len)})).collect::<Vec<_>>(),
            "teamCount":teams.as_object().map_or(0,Map::len)}))
    }
    fn burst_effects(&self) -> Result<Value> {
        let mut items = vec![];
        for s in array(&load(
            &self.data().join("skills_database/电系.json"),
            json!([]),
        )?) {
            if text(&s["name"]) == "雷暴"
                || !options(&s["triggered"])
                    .iter()
                    .any(|o| text(&o["mode"]) == "burst")
            {
                continue;
            }
            items.push(json!({"id":format!("skill:{}",text(&s["name"])),"kind":"skill","name":text(&s["name"]),
                "cost":s["cost"],"element":text(&s["element"]),"type":text(&s["type"]),"skill_power":s["skill_power"],"description":text(&s["description"])}));
        }
        for name in ["生物电", "电流刺激"] {
            let t = self
                .traits
                .iter()
                .find(|t| text(&t["特性"]["名称"]) == name);
            items.push(json!({"id":format!("trait:{name}"),"kind":"trait","name":t.map_or(name, |t| text(&t["特性"]["名称"])),"description":t.map_or("", |t| text(&t["特性"]["效果"]))}));
        }
        items.push(json!({"id":"mark:蓄电印记","kind":"mark","name":"蓄电印记","description":"迸发：本次威力+10。"}));
        Ok(json!({"items":items}))
    }
    pub fn dispatch(&mut self, command: &str, payload: &Value) -> Result<Value> {
        match command {
            "summary" => return self.summary(),
            "presets" => return Ok(json!({"groups":self.preset_groups(&self.presets()?)})),
            "manage-preset" => return self.manage_preset(payload),
            "save-picker-config" => {
                let section = text(&payload["section"]).trim();
                if ![
                    "pet_picker",
                    "trait_picker",
                    "skill_picker",
                    "ui_tokens",
                    "burst_panel",
                    "team_layout",
                    "replay",
                ]
                .contains(&section)
                {
                    return Err(format!("未知配置段: {section}"));
                }
                let mut configs = self.configs()?;
                if configs.get(section).is_none() {
                    configs[section] = json!({});
                }
                if let Some(values) = payload["values"].as_object() {
                    configs[section]
                        .as_object_mut()
                        .ok_or("Invalid config section")?
                        .extend(values.clone());
                }
                save(&self.user.join("configs.json"), &configs)?;
                return Ok(json!({"configs":configs,"section":section}));
            }
            _ => (),
        }
        self.ensure_loaded()?;
        match command {
            "app-state" => {
                let pets: Vec<_> = self
                    .sorted_pets(false)
                    .iter()
                    .map(|p| self.pet_summary(p))
                    .collect();
                let elements: BTreeSet<_> = self
                    .pets
                    .iter()
                    .flat_map(|p| array(&p["elements"]).iter().filter_map(Value::as_str))
                    .collect();
                Ok(
                    json!({"summary":self.summary()?,"presets":self.preset_groups(&self.presets()?),"pets":pets,"elements":elements,"configs":self.configs()?,"burstEffects":self.burst_effects()?["items"]}),
                )
            }
            "list-pets" | "list-traits" => {
                let query = text(&payload["query"]).trim().to_lowercase();
                let element = text(&payload["element"]);
                let mut items = vec![];
                let limit = if command == "list-traits" {
                    500
                } else {
                    let n = integer(&payload["limit"]);
                    if n == 0 {
                        300
                    } else {
                        n.max(1) as usize
                    }
                };
                for p in self.sorted_pets(truth(&payload["sortDesc"])) {
                    let t = &p["特性"];
                    let name = if t.is_object() {
                        text(&t["名称"])
                    } else {
                        text(t).trim()
                    };
                    let searchable = if command == "list-traits" {
                        format!(
                            "{} {} {} {}",
                            text(&p["id"]),
                            text(&p["name"]),
                            name,
                            text(&t["效果"])
                        )
                    } else {
                        format!("{} {} {}", text(&p["id"]), text(&p["name"]), label(p))
                    };
                    if command == "list-traits" && name.is_empty() {
                        continue;
                    }
                    if !query.is_empty() && !searchable.to_lowercase().contains(&query) {
                        continue;
                    }
                    if !element.is_empty()
                        && !array(&p["elements"]).iter().any(|e| text(e) == element)
                    {
                        continue;
                    }
                    if truth(&payload["finalOnly"]) && !self.final_form(p) {
                        continue;
                    }
                    items.push(self.pet_summary(p));
                    if items.len() >= limit {
                        break;
                    }
                }
                Ok(json!({"items":items}))
            }
            "list-skills" => {
                let query = text(&payload["query"]).trim().to_lowercase();
                let element = text(&payload["element"]);
                let mut by_pet = vec![];
                if let Some(p) = self.find(text(&payload["petQuery"]).trim()) {
                    for s in array(&p["skills"]) {
                        let name = text(&s["skill_name"]);
                        if !query.is_empty() && !name.to_lowercase().contains(&query) {
                            continue;
                        }
                        by_pet.push(json!({"name":name,"unlock":s.get("unlock_condition").unwrap_or(&json!("")),"detail":self.skills.iter().find(|s| text(&s["name"])==name)}));
                    }
                }
                let all: Vec<_> = self
                    .skills
                    .iter()
                    .filter(|s| {
                        (query.is_empty() || text(&s["name"]).to_lowercase().contains(&query))
                            && (element.is_empty() || text(&s["element"]) == element)
                    })
                    .collect();
                Ok(json!({"petSkills":by_pet,"allSkills":all}))
            }
            "list-burst-effects" => self.burst_effects(),
            "save-preset" => self.save_preset(payload),
            "import-team-code" => self.import_team_code(payload),
            "apply-skill-buffs" | "skill-trigger-info" => self.skill_info(command, payload),
            _ => Err(format!("Unknown native desktop command: {command}")),
        }
    }
    fn save_preset(&self, payload: &Value) -> Result<Value> {
        let group = string_default(&payload["groupName"], "attackers");
        let state = &payload["state"];
        let mut presets = self.presets()?;
        if presets.get(&group).is_none() {
            presets[&group] = json!({});
        }
        let p = self
            .find(text(&state["name"]).trim())
            .ok_or_else(|| format!("未找到精灵: {}", text(&state["name"])))?;
        let key = text(&payload["presetKey"]).trim();
        let requested = text(&payload["presetName"]).trim();
        let name = if !requested.is_empty() {
            requested.to_owned()
        } else if presets[&group].get(key).is_some() {
            key.to_owned()
        } else {
            label(p)
        };
        if payload.get("overwrite").is_some_and(|v| !truth(v))
            && presets[&group].get(&name).is_some()
        {
            return Err(name);
        }
        let mut data = json!({"id":p["id"],"name":p["name"],"skills":array(&state["skills"]).iter().map(|s|if truth(s){s.clone()}else{json!("")}).collect::<Vec<_>>(),
            "bloodline":if text(&state["bloodline"]).trim().is_empty(){Value::Null}else{json!(text(&state["bloodline"]).trim())},
            "trait_triggered":truth(&state["trait_triggered"]),"trait_stacks":integer(&state["trait_stacks"]).max(0),
            "trait_choices":if truth(&state["trait_choices"]){state["trait_choices"].clone()}else{json!({})},
            "devolution":integer(&state["devolution"]).max(0),"mega":truth(&state["mega"]),"mega_form":if truth(&state["mega_form"]){state["mega_form"].clone()}else{Value::Null}});
        for k in [
            "iv",
            "personality_bouns",
            "personality_down",
            "trait_override_query",
        ] {
            data[k] = state[k].clone();
        }
        let items = presets[&group]
            .as_object_mut()
            .ok_or("Invalid preset group")?;
        if key != name && items.contains_key(key) {
            let mut replaced = Map::new();
            for (k, v) in items.iter() {
                if k == key {
                    replaced.insert(name.clone(), data.clone());
                } else if k != &name {
                    replaced.insert(k.clone(), v.clone());
                }
            }
            *items = replaced;
        } else {
            items.insert(name.clone(), data.clone());
        }
        save(&self.user.join("presets.json"), &presets)?;
        Ok(json!({"presets":self.preset_groups(&presets),"presetName":name,"preset":data}))
    }
    fn manage_preset(&self, payload: &Value) -> Result<Value> {
        let action = text(&payload["action"]).trim();
        let group = text(&payload["groupName"]).trim();
        let key = text(&payload["presetKey"]).trim();
        let target = text(&payload["targetGroup"]).trim();
        let target_name = text(&payload["targetName"]).trim();
        let mut presets = self.presets()?;
        let mut result_group = group.to_owned();
        let mut result_name = key.to_owned();
        match action {
            "create_group" => {
                if group.is_empty() {
                    return Err("分组名不能为空".into());
                }
                if presets.get(group).is_none() {
                    presets[group] = json!({});
                }
                result_name.clear();
            }
            "delete_group" => {
                if group.is_empty() || !presets[group].is_object() {
                    return Err("未找到来源分组".into());
                }
                presets.as_object_mut().unwrap().shift_remove(group);
                result_group = presets
                    .as_object()
                    .unwrap()
                    .iter()
                    .find(|(_, v)| v.is_object())
                    .map_or("", |(k, _)| k)
                    .to_owned();
                result_name.clear();
            }
            "delete_preset" | "copy_preset" | "move_preset" => {
                if group.is_empty() || !presets[group].is_object() {
                    return Err("未找到来源分组".into());
                }
                if key.is_empty() || presets[group].get(key).is_none() {
                    return Err("未找到精灵预设".into());
                }
                if action == "delete_preset" {
                    presets[group].as_object_mut().unwrap().shift_remove(key);
                } else {
                    if target.is_empty() {
                        return Err("目标分组不能为空".into());
                    }
                    let data = presets[group][key].clone();
                    if !presets[target].is_object() {
                        presets[target] = json!({});
                    }
                    let base = if target_name.is_empty() {
                        key
                    } else {
                        target_name
                    };
                    let mut name = base.to_owned();
                    let mut i = 2;
                    while presets[target].get(&name).is_some() {
                        name = format!("{base} 副本{i}");
                        i += 1;
                    }
                    presets[target][&name] = data;
                    if action == "move_preset" {
                        presets[group].as_object_mut().unwrap().shift_remove(key);
                    }
                    result_group = target.into();
                    result_name = name;
                }
            }
            _ => return Err(format!("未知预设操作: {action}")),
        }
        save(&self.user.join("presets.json"), &presets)?;
        Ok(
            json!({"presets":self.preset_groups(&presets),"groupName":result_group,"presetName":result_name}),
        )
    }
}

fn options(v: &Value) -> Vec<&Value> {
    if v.is_object() {
        vec![v]
    } else {
        array(v).iter().filter(|v| v.is_object()).collect()
    }
}

const BUFF_FIELDS: &[&str] = &[
    "phys_atk_buff",
    "mag_atk_buff",
    "phys_def_buff",
    "mag_def_buff",
    "speed_buff",
    "power_multiplier",
    "light_power_buff",
    "power_bonus",
    "combo_plus",
    "combo_mul",
];
fn buff_effect(effect: &Value) -> Result<Option<Value>> {
    if !effect.is_object() {
        return Ok(None);
    }
    let target = effect.get("target").map_or("self", text).trim();
    let field = text(&effect["field"]).trim();
    if !["self", "opponent", "both"].contains(&target)
        || !BUFF_FIELDS.contains(&field)
        || effect["value"].is_null()
    {
        return Ok(None);
    }
    let raw = &effect["value"];
    let value = if let Some(s) = raw.as_str() {
        let s = s.trim();
        if s.is_empty() {
            return Ok(None);
        }
        if let Some(s) = s.strip_suffix('%') {
            let n = s.parse::<f64>().map_err(|e| e.to_string())?;
            if field == "combo_mul" {
                1.0 + n / 100.0
            } else {
                n
            }
        } else {
            s.parse::<f64>().map_err(|e| e.to_string())?
        }
    } else if let Some(b) = raw.as_bool() {
        if b {
            1.0
        } else {
            0.0
        }
    } else {
        raw.as_f64().ok_or("Invalid buff value")?
    };
    if field == "combo_mul" && value <= 0.0 {
        return Ok(None);
    }
    Ok(Some(json!({"target":target,"field":field,"value":value})))
}
fn buff_label(effects: &[Value]) -> String {
    effects
        .iter()
        .map(|e| {
            let target = match text(&e["target"]) {
                "self" => "自己",
                "opponent" => "敌方",
                _ => "双方",
            };
            let n = e["value"].as_f64().unwrap_or(0.0);
            let field = text(&e["field"]);
            if field == "combo_mul" {
                format!("{target}连击 x{n}")
            } else {
                let (label, suffix) = match field {
                    "phys_atk_buff" => ("物攻", "%"),
                    "mag_atk_buff" => ("魔攻", "%"),
                    "phys_def_buff" => ("物防", "%"),
                    "mag_def_buff" => ("魔防", "%"),
                    "speed_buff" => ("速度", ""),
                    "power_multiplier" => ("威力", "%"),
                    "light_power_buff" => ("光系威力", "%"),
                    "power_bonus" => ("威力", ""),
                    _ => ("连击", ""),
                };
                format!("{target}{label} {n:+}{suffix}")
            }
        })
        .collect::<Vec<_>>()
        .join(" / ")
}
fn buff_options(skill: &Value) -> Result<Vec<Value>> {
    let normalize = |effects: &Value| -> Result<Vec<Value>> {
        array(effects)
            .iter()
            .map(buff_effect)
            .collect::<Result<Vec<_>>>()
            .map(|v| v.into_iter().flatten().collect())
    };
    let mut out = vec![];
    if skill.get("buff_options").is_some() {
        for (i, o) in array(&skill["buff_options"]).iter().enumerate() {
            let effects = normalize(&o["effects"])?;
            if effects.is_empty() {
                continue;
            }
            let generated = buff_label(&effects);
            let label = string_default(
                &o["label"],
                if generated.is_empty() { "" } else { &generated },
            );
            out.push(json!({"label":if label.is_empty(){format!("Buff 选项 {}",i+1)}else{label},"effects":effects}));
        }
    } else {
        let effects = normalize(&skill["buff_effects"])?;
        if !effects.is_empty() {
            out.push(json!({"label":buff_label(&effects),"effects":effects}));
        }
    }
    Ok(out)
}
impl DesktopData {
    fn skill_info(&self, command: &str, payload: &Value) -> Result<Value> {
        let name = if truth(&payload["skill_name"]) {
            text(&payload["skill_name"])
        } else {
            text(&payload["skillName"])
        }
        .trim();
        let skill = self
            .skills
            .iter()
            .rev()
            .find(|s| text(&s["name"]) == name)
            .unwrap_or(&Value::Null);
        if command == "apply-skill-buffs" {
            if name.is_empty() {
                return Err("未选择技能".into());
            }
            if skill.is_null() {
                return Err(format!("未找到技能: {name}"));
            }
            let options = buff_options(skill)?;
            return Ok(
                json!({"skill_name":name,"combo_count":1,"effects":options.first().map(|o|&o["effects"]).unwrap_or(&json!([])),"options":options}),
            );
        }
        let trigger_label = |o: &Value, exclude: &[&str]| -> String {
            o.as_object()
                .and_then(|o| o.keys().find(|k| !exclude.contains(&k.as_str())))
                .map(|k| {
                    match k.as_str() {
                        "skill_power_plus" => "威力",
                        "power_multiplier" => "威力%",
                        "combo_plus" => "连击",
                        "combo_mul" => "连击倍",
                        _ => k,
                    }
                    .to_owned()
                })
                .unwrap_or("叠加".into())
        };
        let mut stackable = vec![];
        let mut usage = vec![];
        // Enumerate the original list, including non-object entries, to preserve indexes.
        let opts = if skill["triggered"].is_object() {
            vec![&skill["triggered"]]
        } else {
            array(&skill["triggered"]).iter().collect()
        };
        for (i, o) in opts.iter().enumerate() {
            if !o.is_object() {
                continue;
            }
            if truth(&o["multiple"]) || truth(&o["skill_power_by_count"]) {
                let label = if truth(&o["label"]) {
                    text(&o["label"]).to_owned()
                } else {
                    trigger_label(
                        o,
                        &[
                            "multiple",
                            "condition",
                            "override",
                            "mode",
                            "context",
                            "skill_power_by_count",
                            "label",
                        ],
                    )
                };
                stackable.push(json!({"index":i,"label":label,"max":if array(&o["skill_power_by_count"]).is_empty(){10}else{array(&o["skill_power_by_count"]).len()-1},"affects_power":trigger_affects_power(o)}));
            }
            if text(&o["mode"]) == "usage" {
                usage.push(json!({"index":i,"label":trigger_label(o,&["multiple","condition","override","mode"])}));
            }
        }
        Ok(
            json!({"skill_name":name,"description":text(&skill["description"]),"element":text(&skill["element"]),"has_damage": (["skill_power","power","damage"].iter().any(|k|skill.get(k).is_some())),
            "has_buff":!buff_options(skill)?.is_empty(),"stackable":stackable,"usage_mode_options":usage}),
        )
    }
}

fn base_name(name: &str) -> &str {
    name.trim()
        .split(['（', '(', '【', '['])
        .next()
        .unwrap_or("")
        .trim()
}
fn strip_id(name: &str) -> &str {
    let n = name.trim();
    let stripped = n.trim_start_matches(|c: char| c.is_ascii_digit()).trim();
    if stripped.is_empty() {
        n
    } else {
        stripped
    }
}
// difflib.SequenceMatcher's matching-block ratio, preserving its leftmost tie rule.
fn sequence_ratio(a: &str, b: &str) -> f64 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let mut queue = vec![(0, a.len(), 0, b.len())];
    let mut matched = 0;
    while let Some((alo, ahi, blo, bhi)) = queue.pop() {
        let mut best = (alo, blo, 0);
        let mut prev = vec![0; b.len() + 1];
        for i in alo..ahi {
            let mut next = vec![0; b.len() + 1];
            for j in blo..bhi {
                if a[i] == b[j] {
                    let k = prev[j] + 1;
                    next[j + 1] = k;
                    if k > best.2 {
                        best = (i + 1 - k, j + 1 - k, k);
                    }
                }
            }
            prev = next;
        }
        let (i, j, k) = best;
        if k == 0 {
            continue;
        }
        matched += k;
        if alo < i && blo < j {
            queue.push((alo, i, blo, j));
        }
        if i + k < ahi && j + k < bhi {
            queue.push((i + k, ahi, j + k, bhi));
        }
    }
    2.0 * matched as f64 / (a.len() + b.len()) as f64
}
const STATS: [&str; 6] = ["hp", "atk", "mag", "def", "res", "spd"];
const STAT_LABELS: [&str; 6] = ["生命", "物攻", "魔攻", "物防", "魔防", "速度"];
fn personality(
    nature: &str,
    correction: &[&str],
) -> (Option<&'static str>, Option<&'static str>, Vec<String>) {
    // Nature rows exclude the row's own stat and follow the game's original code table.
    let rows = [
        ("a", "hp", "atk"),
        ("c", "hp", "mag"),
        ("b", "hp", "def"),
        ("d", "hp", "res"),
        ("e", "hp", "spd"),
        ("F", "atk", "hp"),
        ("C", "atk", "mag"),
        ("B", "atk", "def"),
        ("D", "atk", "res"),
        ("E", "atk", "spd"),
        ("K", "def", "hp"),
        ("G", "def", "atk"),
        ("H", "def", "mag"),
        ("I", "def", "res"),
        ("J", "def", "spd"),
        ("Z", "spd", "hp"),
        ("V", "spd", "atk"),
        ("X", "spd", "mag"),
        ("W", "spd", "def"),
        ("Y", "spd", "res"),
        ("P", "mag", "hp"),
        ("L", "mag", "atk"),
        ("M", "mag", "def"),
        ("N", "mag", "res"),
        ("O", "mag", "spd"),
        ("U", "res", "hp"),
        ("Q", "res", "atk"),
        ("S", "res", "mag"),
        ("R", "res", "def"),
        ("T", "res", "spd"),
    ];
    let Some((_, orig_plus, orig_minus)) = rows.iter().find(|r| r.0 == nature) else {
        return (
            None,
            None,
            vec![format!("未识别的性格字母“{nature}”，性格按未指定处理")],
        );
    };
    let (mut plus, mut minus) = (*orig_plus, *orig_minus);
    let mut applied = vec![];
    let mut notes = vec![];
    for (i, c) in correction.iter().take(2).enumerate() {
        if let Some(j) = ["B", "C", "D", "E", "F", "G"].iter().position(|v| v == c) {
            if i == 0 {
                plus = STATS[j]
            } else {
                minus = STATS[j]
            };
            applied.push(format!(
                "{}{}",
                if i == 0 { "正面→" } else { "负面→" },
                STAT_LABELS[j]
            ));
        }
    }
    if !applied.is_empty() {
        notes.push(format!("性格修正：{}", applied.join("、")));
    }
    if plus == minus {
        notes.push("性格修正后正负属性相同，已忽略修正".into());
        plus = orig_plus;
        minus = orig_minus;
    }
    (Some(plus), Some(minus), notes)
}
impl DesktopData {
    fn team_candidates(&self, query: &str) -> Vec<&Value> {
        let normalized = query.trim();
        let stripped = strip_id(normalized);
        let base = base_name(stripped);
        let alias = |p: &Value, q: &str| match &p["other_name"] {
            Value::Object(o) => o.iter().any(|(k, v)| k == q || text(v) == q),
            Value::Array(a) => a.iter().any(|v| text(v) == q),
            _ => false,
        };
        let mut candidates: Vec<_> = self
            .pets
            .iter()
            .filter(|p| {
                label(p) == normalized
                    || label(p) == stripped
                    || text(&p["name"]) == stripped
                    || alias(p, stripped)
                    || (base != stripped && (text(&p["name"]) == base || alias(p, base)))
                    || (!base.is_empty() && base_name(text(&p["name"])) == base)
            })
            .collect();
        if candidates.is_empty() && !base.is_empty() {
            candidates = self
                .pets
                .iter()
                .filter(|p| {
                    let n = base_name(text(&p["name"]));
                    base.contains(n) || n.contains(base)
                })
                .collect();
        }
        if candidates.is_empty() && !base.is_empty() {
            let names: BTreeSet<_> = self
                .pets
                .iter()
                .map(|p| text(&p["name"]))
                .filter(|s| !s.is_empty())
                .collect();
            let mut scored: Vec<_> = names
                .iter()
                .map(|n| (sequence_ratio(base, base_name(n)), *n))
                .collect();
            scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(b.1)));
            for (score, name) in scored.into_iter().take(5) {
                if score >= 0.5 {
                    candidates.extend(self.pets.iter().filter(|p| text(&p["name"]) == name));
                }
            }
        }
        candidates.sort_by_key(|p| format!("{}.json", label(p)));
        candidates
    }
    fn import_team_code(&self, payload: &Value) -> Result<Value> {
        let mode = string_default(&payload["mode"], "create");
        if !["create", "overwrite"].contains(&mode.as_str()) {
            return Err(format!("未知的导入方式: {mode}"));
        }
        let group = text(&payload["groupName"]).trim();
        if group.is_empty() {
            return Err("分组名不能为空".into());
        }
        let re = Regex::new(r"^([^：:]+)[：:]([^、{}]*)、?\s*\{([^}]*)\}").unwrap();
        let mut code = "";
        let mut entries = vec![];
        for raw in text(&payload["text"]).lines() {
            let line = raw.trim().trim_start_matches('#').trim();
            if line.is_empty() {
                continue;
            }
            if line.contains("~~~") {
                if line.chars().count() > code.chars().count() {
                    code = line;
                }
                continue;
            }
            if let Some(c) = re.captures(line) {
                entries.push((
                    c[1].trim().to_owned(),
                    c[2].trim().to_owned(),
                    c[3].split(['、', ',', '，'])
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(str::to_owned)
                        .collect::<Vec<_>>(),
                ));
            }
        }
        if code.is_empty() {
            return Err("没有找到阵容码，请粘贴游戏里复制的完整内容".into());
        }
        if entries.is_empty() {
            return Err("没有找到精灵说明行（形如 # 音速犬：首领血脉、{灼伤、热身}）".into());
        }
        let records: Vec<_> = code.split("~~~").skip(1).collect();
        if records.len() != entries.len() {
            return Err(format!(
                "阵容码与精灵说明数量不一致：码内 {} 只，说明行 {} 只",
                records.len(),
                entries.len()
            ));
        }
        let correction_re = Regex::new(r"F((?:[A-G]~)+)$").unwrap();
        let corrections: Vec<_> = correction_re
            .captures(code)
            .map(|c| {
                c.get(1)
                    .unwrap()
                    .as_str()
                    .split('~')
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        let mut presets = self.presets()?;
        if mode == "overwrite" && presets.get(group).is_none() {
            return Err(format!("未找到当前分组: {group}"));
        }
        let mut report = vec![];
        if entries.len() > 6 {
            report.push(format!(
                "阵容码内有 {} 只精灵，超过队伍上限，已只取前 6 只",
                entries.len()
            ));
        }
        let mut items = Map::new();
        for (i, ((name, blood, skills), record)) in entries.iter().zip(records).take(6).enumerate()
        {
            let candidates = self.team_candidates(name);
            let owned = |p: &Value| {
                array(&p["skills"])
                    .iter()
                    .map(|s| text(&s["skill_name"]).to_owned())
                    .collect::<BTreeSet<_>>()
            };
            let matched: Vec<_> = candidates
                .iter()
                .copied()
                .filter(|p| skills.iter().all(|s| owned(p).contains(s)))
                .collect();
            let Some(p) = matched.first().or_else(|| candidates.first()) else {
                report.push(format!("{name}：精灵库中没有找到，已跳过"));
                continue;
            };
            let parts: Vec<_> = record.split('~').collect();
            let nature = parts.get(1).copied().unwrap_or("");
            let corr: Vec<_> = corrections.iter().skip(i * 2).take(2).copied().collect();
            let (plus, minus, notes) = personality(nature, &corr);
            let mut iv = json!({"hp":0,"atk":0,"mag":0,"def":0,"res":0,"spd":0});
            let chars: Vec<_> = parts.get(2).unwrap_or(&"").chars().collect();
            for pair in chars.chunks(2) {
                if pair.len() < 2 || !['B', '0'].contains(&pair[0]) {
                    break;
                }
                let Some(j) = ['P', 'Q', 'R', 'S', 'T', 'U']
                    .iter()
                    .position(|c| *c == pair[1])
                else {
                    break;
                };
                if pair[0] != '0' {
                    iv[STATS[j]] = json!(10);
                }
            }
            let mut lines = vec![format!("{name} → {}", label(p))];
            let n = candidates.len();
            let m = matched.len();
            if n > 1 {
                lines.push(if m == 1 {
                    format!("候选形态 {n} 个，技能表唯一确定这个形态")
                } else if m > 1 {
                    format!(
                        "候选形态 {n} 个，其中 {m} 个的技能表都符合，已取第一个（请自行确认形态）"
                    )
                } else {
                    format!("候选形态 {n} 个，技能表都对不上，已取第一个（请自行确认形态）")
                });
            }
            let owned = owned(p);
            let missing: Vec<_> = skills
                .iter()
                .filter(|s| !owned.contains(*s))
                .cloned()
                .collect();
            if !missing.is_empty() {
                lines.push(format!("技能不在该精灵技能表里：{}", missing.join("、")));
            }
            if let (Some(plus), Some(minus)) = (plus, minus) {
                lines.push(format!(
                    "性格：加{}、减{}",
                    STAT_LABELS[STATS.iter().position(|s| *s == plus).unwrap()],
                    STAT_LABELS[STATS.iter().position(|s| *s == minus).unwrap()]
                ));
            }
            lines.extend(notes);
            report.push(lines.join("｜"));
            let pet_name = if text(&p["name"]).is_empty() {
                name.as_str()
            } else {
                text(&p["name"])
            };
            let mut key = pet_name.to_owned();
            let mut suffix = 2;
            while items.contains_key(&key) {
                key = format!("{pet_name} {suffix}");
                suffix += 1;
            }
            items.insert(key,json!({"id":p["id"],"name":pet_name,"iv":iv,"personality_bouns":plus,"personality_down":minus,"skills":skills,"bloodline":if blood.is_empty(){Value::Null}else{json!(blood)},
                "trait_override_query":null,"trait_triggered":false,"trait_stacks":0,"trait_choices":{},"devolution":0,"mega":false,"mega_form":null}));
        }
        if items.is_empty() {
            return Err("没有可导入的精灵，请检查阵容码内容".into());
        }
        presets[group] = Value::Object(items);
        save(&self.user.join("presets.json"), &presets)?;
        Ok(json!({"presets":self.preset_groups(&presets),"groupName":group,"report":report}))
    }
}
