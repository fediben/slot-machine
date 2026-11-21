// Unity Editor 5.6 scene installer. No game logic or existing scene objects are deleted.
// Open Assets/reel_scene.unity, then Tools > Slot Kiosk > Prepare Event Scene.
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

public static class SlotKioskSceneInstaller
{
    [MenuItem("Tools/Slot Kiosk/Prepare Event Scene")]
    public static void Install()
    {
        ReelManager reels = Object.FindObjectOfType<ReelManager>();
        ScoreManager scores = Object.FindObjectOfType<ScoreManager>();
        PigParadeManager pigs = Object.FindObjectOfType<PigParadeManager>();
        SoundManager sound = Object.FindObjectOfType<SoundManager>();
        if (reels == null || scores == null)
        {
            EditorUtility.DisplayDialog("Slot Kiosk", "Open the original reel_scene.unity first. Missing ReelManager or ScoreManager.", "OK");
            return;
        }

        GameObject root = GameObject.Find("Slot Kiosk Services");
        if (root == null) root = new GameObject("Slot Kiosk Services");
        KioskApiClient api = Component<KioskApiClient>(root);
        KioskInput input = Component<KioskInput>(root);
        KioskGameBridge bridge = Component<KioskGameBridge>(root);
        KioskQrDisplay qr = Component<KioskQrDisplay>(root);
        KioskLeaderboard board = Component<KioskLeaderboard>(root);

        bridge.api = api;
        bridge.buttons = input;
        bridge.reels = reels;
        bridge.scores = scores;
        bridge.pigs = pigs;
        bridge.sound = sound;
        bridge.qrView = qr;
        reels.ManagedByKiosk = true;

        GameObject canvasObj = GameObject.Find("Slot Kiosk HUD");
        if (canvasObj == null)
        {
            canvasObj = new GameObject("Slot Kiosk HUD", typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        }
        Canvas canvas = Component<Canvas>(canvasObj);
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = 1000;
        CanvasScaler scale = Component<CanvasScaler>(canvasObj);
        scale.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scale.referenceResolution = new Vector2(1920,1080);

        Text instructions = CreateText(canvasObj.transform,"Scan instructions",new Vector2(660,270),new Vector2(0,0),28);
        Text joinUrl = CreateText(canvasObj.transform,"Join URL",new Vector2(680,65),new Vector2(0,-290),17);
        Text status = CreateText(canvasObj.transform,"Machine state",new Vector2(690,70),new Vector2(0,460),27);
        Text player = CreateText(canvasObj.transform,"Current player",new Vector2(690,70),new Vector2(0,400),24);
        Text ranking = CreateText(canvasObj.transform,"Top 10",new Vector2(420,610),new Vector2(700,0),26);
        RawImage image = CreateQR(canvasObj.transform);
        qr.qrTarget = image;
        qr.instructions = instructions;
        api.StatusText = status;
        api.PlayerText = player;
        api.CheckinUrlText = joinUrl;
        board.api = api;
        board.board = ranking;

        EditorUtility.SetDirty(reels);
        EditorUtility.SetDirty(root);
        EditorSceneManager.MarkSceneDirty(EditorSceneManager.GetActiveScene());
        EditorSceneManager.SaveOpenScenes();
        EditorUtility.DisplayDialog("Slot Kiosk", "Installed event services and HUD. Configure device.json at runtime, verify video layout and keyboard/USB controls, then test in Play Mode.", "OK");
    }

    [MenuItem("Tools/Slot Kiosk/Set Linux Build Scene")]
    public static void SetBuildScene()
    {
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/reel_scene.unity",true) };
        Debug.Log("Slot Kiosk: reel_scene.unity added to Build Settings");
    }

    private static T Component<T>(GameObject obj) where T : Component
    {
        T component = obj.GetComponent<T>();
        return component != null ? component : obj.AddComponent<T>();
    }

    private static Text CreateText(Transform parent,string name,Vector2 size,Vector2 pos,int fontSize)
    {
        Transform old=parent.Find(name);
        GameObject obj=old == null? new GameObject(name,typeof(RectTransform),typeof(Text)):old.gameObject;
        obj.transform.SetParent(parent,false);
        RectTransform rect=obj.GetComponent<RectTransform>();
        rect.sizeDelta=size;
        rect.anchoredPosition=pos;
        Text text=Component<Text>(obj);
        text.font=Resources.GetBuiltinResource<Font>("Arial.ttf");
        text.fontSize=fontSize;
        text.alignment=TextAnchor.MiddleCenter;
        text.color=new Color(0.98f,0.93f,0.79f);
        return text;
    }

    private static RawImage CreateQR(Transform parent)
    {
        Transform old=parent.Find("Player QR Code");
        GameObject obj=old==null?new GameObject("Player QR Code",typeof(RectTransform),typeof(RawImage)):old.gameObject;
        obj.transform.SetParent(parent,false);
        RectTransform rect=obj.GetComponent<RectTransform>();
        rect.sizeDelta=new Vector2(320,320);
        rect.anchoredPosition=new Vector2(0,50);
        RawImage image=Component<RawImage>(obj);
        image.gameObject.SetActive(false);
        return image;
    }
}
#endif
