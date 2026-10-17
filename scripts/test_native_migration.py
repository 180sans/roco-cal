"""Compare the native desktop modules with the existing Python implementation.

Run with a development Python with numpy, OpenCV, Pillow and ONNX Runtime:
  python -B scripts/test_native_migration.py
Only a small headless Rust harness is built, never the Tauri application.
"""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / "src-tauri/resources/rocodatebase"
EXE = PROJECT / ".cargo-check-native/debug/native-migration-check.exe"
sys.path.insert(0, str(ROOT))


class Native:
    def __init__(self, root, user, **env):
        self.process = subprocess.Popen([str(EXE), str(root), str(user)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8",
                                        env={**os.environ, **env}, creationflags=subprocess.CREATE_NO_WINDOW)
        self.times = []

    def call(self, command, payload=None):
        self.process.stdin.write(json.dumps({"command": command, "payload": payload or {}}, ensure_ascii=False) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        assert line, f"Native harness exited: {self.process.poll()}"
        result = json.loads(line)
        self.times.append((command, result["elapsedMs"]))
        return result

    def close(self):
        self.process.stdin.close()
        assert self.process.wait(timeout=20) == 0


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def first_difference(a,b,path="root"):
    if isinstance(a,dict) and isinstance(b,dict):
        if a.keys()!=b.keys():return path+": keys "+str(a.keys())+" != "+str(b.keys())
        for k in a:
            if a[k]!=b[k]:return first_difference(a[k],b[k],path+"."+k)
    elif isinstance(a,list) and isinstance(b,list):
        if len(a)!=len(b):return f"{path}: length {len(a)} != {len(b)}"
        for i,(x,y) in enumerate(zip(a,b)):
            if x!=y:return first_difference(x,y,f"{path}[{i}]")
    return f"{path}: {a!r} != {b!r}"


def data_parity(api):
    import core.trait_library as traits
    import core.skill_finder as skills
    with tempfile.TemporaryDirectory(prefix="roco-native-parity-") as tmp:
        root = Path(tmp) / "rocodatebase"
        data = root / "data"
        py_user, rs_user = Path(tmp) / "python", Path(tmp) / "rust"
        py_user.mkdir(); rs_user.mkdir()
        trait = {"特性": {"名称": "电流刺激", "效果": "测试迸发", "battle_effect": {"affects_battle": True}}}
        write(data / "pets_trait_json/passive/电流刺激.json", trait)
        pets = [
            {"id":"001","name":"喵喵","other_name":{"旧名":"小猫"},"elements":["草"],"特性":"电流刺激","evolution":{"next":["002大猫"]},"skills":[{"skill_name":"抓","unlock_condition":"初始"}]},
            {"id":"002","name":"大猫","elements":["草","电"],"特性":{"名称":"自带","效果":"直接摘要"},"evolution":{"next":["003大猫Mega"]},"skills":[{"skill_name":"雷暴"}]},
            {"id":"003","name":"大猫Mega","elements":["电"],"evolution":{"stage":"mega"}},
            {"id":"004","name":"鸭吉吉","elements":["水"],"other_name":["鸭子"],"skills":[{"skill_name":"抓"}]},
            {"id":"005","name":"鸭吉吉（形态）","elements":["水"],"skills":[{"skill_name":"引雷"}]},
            {"id":"006","name":"鸭吉吉国王","elements":["水"]},
            {"id":"007","name":"鸭吉吉【特殊】","skills":[{"skill_name":"引雷"}]},
            {"id":"008","name":"失联进化","evolution":{"next":["999找不到"]}},
        ]
        for p in pets: write(data / "pets_w_skill_json" / f"{p['id']}{p['name']}.json", p)
        skill_data = [
            {"name":"抓","skill_power":20,"triggered":[None,{"multiple":True,"skill_power_plus":5},{"mode":"usage","combo_plus":1}],"buff_effects":[{"field":"phys_atk_buff","value":"50%"},{"field":"combo_mul","value":"50%","target":"both"}]},
            {"name":"引雷","skill_power":40,"mode":"x","triggered":{"skill_power_by_count":[0,30,50],"label":"自定义","mode":"burst"},"buff_options":[{"effects":[{"field":"power_bonus","value":5},{"field":"wrong","value":2}]}]},
            {"name":"雷暴","triggered":{"mode":"burst"}},
            {"name":"错误选项","buff_options":"bad"},
            {"name":"光系强化","buff_effects":[{"field":"light_power_buff","value":"50%"}]},
            {"name":"光系条件强化","buff_options":[{"label":"应对防御","effects":[{"target":"self","field":"light_power_buff","value":100}]}]},
            {"name":"非法buff","buff_effects":[{"field":"combo_mul","value":0},{"field":"power_bonus","value":True}]},
        ]
        write(data / "skills_database/电系.json", skill_data)
        write(data / "presets.json", {"第二组":{"旧预设":{"name":"大猫","id":"002","skills":["雷暴"]}},"第一组":{}})
        write(data / "teams.json", {"team":[]})
        write(data / "configs.json", {"team_layout":{"a":1,"b":2},"ui_tokens":{"nested":{"x":1}},"scalar":1})
        for user in [py_user,rs_user]: write(user / "configs.json", {"team_layout":{"b":3},"ui_tokens":{"nested":{"y":2}}})
        # Load the unchanged finder against fixtures instead of the user's DB.
        finder = types.ModuleType("core.find_pets")
        finder.__file__ = str(ROOT / "core/find_pets.py")
        code = (ROOT / "core/find_pets.py").read_text(encoding="utf-8")
        exec(compile(code.replace("pets_dataset = SpiritFinder(data_dir=data_dir)", "pets_dataset = None"), finder.__file__, "exec"), finder.__dict__)
        sys.modules["core.find_pets"] = finder
        traits.TRAIT_DIR = str(data / "pets_trait_json")
        traits._load_trait_data_by_name_cached.cache_clear()
        finder.pets_dataset = finder.SpiritFinder(str(data / "pets_w_skill_json"))
        skills.skill_dataset = skills.SkillRepository(str(data / "skills_database"))
        api.BASE_DIR=root; api.DATA_DIR=data; api.PETS_DIR=data/"pets_w_skill_json"; api.SKILLS_DIR=data/"skills_database"
        api.USER_DATA_DIR=py_user; api.PRESETS_PATH=py_user/"presets.json"; api.CONFIGS_PATH=py_user/"configs.json"; api.TEAMS_PATH=py_user/"teams.json"
        api.DEFAULT_PRESETS_PATH=data/"presets.json"; api.DEFAULT_TEAMS_PATH=data/"teams.json"; api.DEFAULT_CONFIGS_PATH=data/"configs.json"
        native=Native(root,rs_user)
        count=0
        def compare(command,payload=None):
            nonlocal count
            payload=payload or {}
            fun=getattr(api,command.replace("-","_") if command!="presets" else "list_presets")
            try:
                expected=fun() if command in {"summary","presets","app-state","list-burst-effects"} else fun(payload)
            except Exception as e:
                actual=native.call(command,payload)
                assert not actual["ok"] and actual["error"]==str(e), (command,payload,actual,str(e))
            else:
                actual=native.call(command,payload)
                assert actual["ok"],(command,payload,actual)
                if command in {"summary","app-state"}:
                    summary=expected if command=="summary" else expected["summary"]
                    summary["userDataDir"]=str(rs_user)
                assert actual["data"]==expected,(command,payload,actual["data"],expected)
            count+=1
        for command in ["summary","presets","app-state","list-burst-effects"]:compare(command)
        for command in ["list-pets","list-traits"]:
            for payload in [{},{"sortDesc":True},{"finalOnly":True},{"query":"鸭"},{"element":"电"},{"query":"电流","finalOnly":True},{"limit":1}]:compare(command,payload)
        for query in ["","抓","雷","notfound"]:
            for pet in ["","001喵喵","小猫","鸭子"]:compare("list-skills",{"query":query,"petQuery":pet})
        for name in ["抓","引雷","雷暴","错误选项","非法buff","光系强化","光系条件强化","不存在",""]:
            for cmd in ["apply-skill-buffs","skill-trigger-info"]:compare(cmd,{"skillName":name})
        for action,extra in [("create_group",{"groupName":"新组"}),("copy_preset",{"groupName":"第二组","presetKey":"旧预设","targetGroup":"新组"}),("move_preset",{"groupName":"新组","presetKey":"旧预设","targetGroup":"第二组"}),("delete_preset",{"groupName":"第二组","presetKey":"旧预设 副本2"}),("delete_group",{"groupName":"新组"}),("delete_group",{"groupName":"缺失"})]:compare("manage-preset",{"action":action,**extra})
        state={"name":"小猫","skills":["抓",None],"trait_stacks":-2,"devolution":-1,"trait_choices":{"a":"b"},"bloodline":" 首领血脉 ","iv":{"hp":10}}
        compare("save-preset",{"state":state,"presetName":"自选","groupName":"第二组"})
        compare("save-preset",{"state":state,"presetKey":"自选","presetName":"重命名","groupName":"第二组"})
        compare("save-preset",{"state":state,"presetName":"重命名","groupName":"第二组","overwrite":False})
        compare("save-picker-config",{"section":"team_layout","values":{"c":4}})
        compare("save-picker-config",{"section":"bad","values":{}})
        for name,skills_text in [("鸭吉吉","引雷"),("鸭吉吉国","抓"),("大猫","雷暴"),("999鸭吉吉","抓"),("喵猫","抓")]:
            compare("import-team-code",{"groupName":"导入","text":f"# {name}：首领血脉、{{{skills_text}}} 加物攻\nCODE~~~B~F~BPBQBRBSBTBU~FA~B~"})
        for nature in "FCBDEKGHIJacbdeZVXWYP LMNOUQSRT?".replace(" ",""):
            compare("import-team-code",{"groupName":"导入","text":f"# 喵喵：、{{抓}}\nCODE~~~B~{nature}~BP0Q~FC~D~"})
        for payload in [{"groupName":""},{"groupName":"x","text":"bad"},{"groupName":"x","text":"a~~~b"},{"groupName":"x","text":"# 喵喵：、{抓}\na~~~b~~~c"}]:compare("import-team-code",payload)
        compare("app-state")
        assert json.loads((py_user/"presets.json").read_text(encoding="utf-8"))==json.loads((rs_user/"presets.json").read_text(encoding="utf-8"))
        native.close()
        print(f"Data / preset / team-code parity: {count} cases passed")
        return count


def image_url(image):
    output=io.BytesIO(); image.save(output,format="PNG")
    return "data:image/png;base64,"+base64.b64encode(output.getvalue()).decode("ascii")


def inference_parity(api):
    import numpy as np
    import cv2
    from PIL import Image
    api.BASE_DIR=ROOT
    api.CLASSIFIER_DIR=ROOT.parent/"image-classifier"
    native=Native(ROOT,PROJECT/".cargo-check-native/unused-user")
    rng=np.random.default_rng(719)
    count=0
    for value in ["", "1/10", "10/1", "001/010", "123/456", "17718", "007710", "171", "123", "1/2/3", "7/0", "123456789012345678901234567890/999999999999999999999999999999"]:
        actual=native.call("normalize-health",{"text":value})
        assert actual["ok"] and actual["data"]==api.normalize_health_text(value),(value,actual,api.normalize_health_text(value))
        count+=1
    for w,h in [(76,86),(38,43),(150,160),(152,172),(200,100),(1,1),(45,27),(320,60),(600,700),(700,300)]:
        rgb=rng.integers(0,256,(h,w,3),dtype=np.uint8)
        width=max(48,min(320,round(w/h*48)))
        p={"imageDataUrl":image_url(Image.fromarray(rgb)),"width":width}
        actual=native.call("number-tensor",p)
        assert actual["ok"],actual
        resized=cv2.resize(rgb,(width,48),interpolation=cv2.INTER_LINEAR)
        expected=((resized.astype(np.float32)/255-0.5)/0.5).transpose(2,0,1).ravel()
        delta=np.max(np.abs(np.asarray(actual["data"],dtype=np.float32)-expected))
        assert delta==0,("OpenCV preprocessing mismatch",w,h,delta)
        rgba=rng.integers(0,256,(h,w,4),dtype=np.uint8)
        source=Image.fromarray(rgba);p={"imageDataUrl":image_url(source)}
        actual=native.call("classifier-tensor",p);assert actual["ok"],actual
        source.thumbnail((76,86),Image.Resampling.LANCZOS)
        canvas=Image.new("RGBA",(76,86),(0,0,0,0));canvas.alpha_composite(source,((76-source.width)//2,(86-source.height)//2))
        expected=np.asarray(canvas.convert("RGB"),dtype=np.float32).transpose(2,0,1).ravel()/255
        delta=np.max(np.abs(np.asarray(actual["data"],dtype=np.float32)-expected))
        assert delta==0,("Pillow preprocessing mismatch",w,h,delta)
        count+=2
    debug=Path(os.environ["APPDATA"])/"com.sans.rocodatebase/ocr-debug-inputs"
    numeric=sorted((debug/"numeric").glob("*.png"),key=lambda p:p.stat().st_mtime,reverse=True)[:20]
    sprites=sorted((debug/"battle-live-pets").glob("*.png"),key=lambda p:p.stat().st_mtime,reverse=True)[:12]
    for path in numeric:
        mode="self_health" if "selfHealth" in path.name else "enemy_health" if "enemyHealth" in path.name else "power"
        p={"imageDataUrl":image_url(Image.open(path)),"mode":mode}
        expected=api.recognize_images({"images":[p]});actual=native.call("recognize-images",{"images":[p]})
        assert actual["ok"] and actual["data"]==expected,(path,actual,expected)
        count+=1
    for size in [2, 3, 4, 6]:
        if len(numeric)<size:continue
        p={"images":[{"imageDataUrl":image_url(Image.open(path)),"mode":"power"}for path in numeric[:size]]}
        expected=api.recognize_images(p);actual=native.call("recognize-images",p)
        assert actual["ok"] and actual["data"]==expected,("multi-crop ordering",size,actual,expected)
        count+=1
    for i in range(0,len(sprites),2):
        p={"images":[{"imageDataUrl":image_url(Image.open(path))}for path in sprites[i:i+2]]}
        expected=api.classify_image_samples(p);actual=native.call("classify-image-samples",p);assert actual["ok"],actual
        for a,b in zip(actual["data"]["items"],expected["items"]):
            assert a["label"]==b["label"] and [x["label"]for x in a["topK"]]==[x["label"]for x in b["topK"]],(a,b)
            assert abs(a["confidence"]-b["confidence"])<1e-5,(a,b)
        count+=1
    if len(numeric)>=2 and len(sprites)>=2:
        first=[{"imageDataUrl":image_url(Image.open(numeric[0])),"mode":"number"}]
        second=[{"imageDataUrl":image_url(Image.open(numeric[1])),"mode":"number"}]
        sprite_payload={"images":[{"imageDataUrl":image_url(Image.open(p))}for p in sprites[:2]]}
        actual=native.call("parallel-inference",{"first":first,"second":second,"sprites":sprite_payload})
        assert actual["ok"],actual
        assert actual["data"]["first"]==api.recognize_images({"images":first})
        assert actual["data"]["second"]==api.recognize_images({"images":second})
        assert [v["label"] for v in actual["data"]["sprites"]["items"]]==[v["label"]for v in api.classify_image_samples(sprite_payload)["items"]]
        count+=1
    for command,p in [("recognize-images",{"images":[{"imageDataUrl":"invalid","mode":"number"}]}),("recognize-images",{"images":[{"mode":"text"}]}),("classify-image-samples",{"images":None})]:
        assert not native.call(command,p)["ok"]
        count+=1
    native.close()
    print(f"Image preprocessing / real-model parity: {count} cases passed ({len(numeric)} numeric crops, {len(sprites)} sprite crops)")
    print("Native model timing:",json.dumps([t for t in native.times if t[0] in {"recognize-images","classify-image-samples"}]))
    return count


def real_data_parity(api):
    from core.find_pets import pets_dataset
    with tempfile.TemporaryDirectory(prefix="roco-native-real-") as tmp:
        user=Path(tmp)
        api.USER_DATA_DIR=user;api.PRESETS_PATH=user/"presets.json";api.TEAMS_PATH=user/"teams.json";api.CONFIGS_PATH=user/"configs.json"
        native=Native(ROOT,user)
        count=0
        for command,payload in [("summary",{}),("app-state",{}),("presets",{}),("list-burst-effects",{}),
            *[(cmd,p)for cmd in ["list-pets","list-traits"]for p in [{},{"finalOnly":True},{"sortDesc":True},{"query":"迪迪"},{"element":"电"}]]]:
            fun=getattr(api,command.replace('-','_')if command!='presets'else'list_presets')
            expected=fun()if command in {"summary","app-state","presets","list-burst-effects"}else fun(payload)
            actual=native.call(command,payload)
            assert actual["ok"],actual
            assert actual["data"]==expected,(command,payload,first_difference(actual["data"],expected))
            count+=1
        for skill in api.list_skills({})["allSkills"]:
            name=skill.get("name","")
            for command in ["apply-skill-buffs","skill-trigger-info"]:
                expected=getattr(api,command.replace('-','_'))({"skillName":name})
                actual=native.call(command,{"skillName":name})
                assert actual["ok"] and actual["data"]==expected,(command,name,actual,expected)
                count+=1
        print(f"Real database summaries and all skill definitions: {count} cases passed",flush=True)
        # All skill files were already compared above. Cache their immutable
        # details rather than rereading them for every one of 618 pet fixtures.
        all_skills=api.list_skills({})["allSkills"]
        details={}
        for s in all_skills:details.setdefault(s.get("name"),s)
        for p in pets_dataset.load_all():
            actual=native.call("list-skills",{"petQuery":api._pet_label(p)})
            expected={"petSkills":[{"name":s.get("skill_name",""),"unlock":s.get("unlock_condition",""),"detail":details.get(s.get("skill_name",""))}for s in p.get("skills",[])],"allSkills":all_skills}
            assert actual["ok"] and actual["data"]==expected,("pet skills",api._pet_label(p),str(actual)[:1500],str(expected)[:1500])
            count+=1
        native.close()
        print(f"Real database parity: {count} cases passed")


if __name__=="__main__":
    spec=importlib.util.spec_from_file_location("desktop_api",ROOT/"desktop_api.py")
    api=importlib.util.module_from_spec(spec);spec.loader.exec_module(api)
    if "--real" in sys.argv:
        real_data_parity(api)
    else:
        data_parity(api)
        inference_parity(api)
