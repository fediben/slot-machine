// Unity Editor menu item and optional headless batch entrypoint.
// Install the Linux platform module for the Unity Editor before running.
#if UNITY_EDITOR
using System;
using UnityEditor;
using UnityEngine;

public static class BuildSlotKiosk
{
    [MenuItem("Tools/Slot Kiosk/Build Linux x86-64")]
    public static void BuildLinux()
    {
        string scene = "Assets/reel_scene.unity";
        if (AssetDatabase.LoadAssetAtPath<UnityEngine.Object>(scene) == null)
            throw new Exception("Original Unity scene not found: " + scene);
        EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Standalone, BuildTarget.StandaloneLinux64);
        string output = "Builds/Linux/SlotKiosk.x86_64";
        System.IO.Directory.CreateDirectory("Builds/Linux");
#if UNITY_2018_1_OR_NEWER
        var report = BuildPipeline.BuildPlayer(new[] { scene }, output, BuildTarget.StandaloneLinux64, BuildOptions.None);
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            throw new Exception("Unity Linux build failed; inspect Editor.log");
#else
        string result = BuildPipeline.BuildPlayer(new[] { scene }, output, BuildTarget.StandaloneLinux64, BuildOptions.None);
        if (!String.IsNullOrEmpty(result)) throw new Exception("Unity Linux build failed: " + result);
#endif
        Debug.Log("Slot Kiosk Linux build created: " + output);
    }
}
