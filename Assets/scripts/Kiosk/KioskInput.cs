// Input abstraction for the future Unity kiosk scene.
// Wire this to the new flow; do not simultaneously process the old ReelManager.Update input.
using UnityEngine;
using System;

public class KioskInput : MonoBehaviour
{
    public KeyCode SpinKey = KeyCode.Space;
    public KeyCode BetOneKey = KeyCode.Alpha1;
    public KeyCode BetThreeKey = KeyCode.Alpha3;
    public KeyCode JoinKey = KeyCode.Return;
    public KeyCode EndKey = KeyCode.Escape;
    public bool EnableLegacyUsbEncoderBindings = true;

    public event Action Spin;
    public event Action BetOne;
    public event Action BetThree;
    public event Action Join;
    public event Action End;

    private bool Pressed(KeyCode key, string legacyName)
    {
        bool keyboard = Input.GetKeyDown(key);
        if (!EnableLegacyUsbEncoderBindings) return keyboard;
        // Each binding already exists in this legacy project; validate encoder wiring on-site.
        return keyboard || Input.GetButtonDown(legacyName);
    }
    void Update()
    {
        if (Pressed(SpinKey, "Spin") || (EnableLegacyUsbEncoderBindings && Input.GetButtonDown("Spin2")))
        {
            if (Spin != null) Spin();
        }
        if (Pressed(BetOneKey, "Bet1") && BetOne != null) BetOne();
        if (Pressed(BetThreeKey, "Bet3") && BetThree != null) BetThree();
        if (Pressed(JoinKey, "LogIn") && Join != null) Join();
        if (Pressed(EndKey, "CashOut") && End != null) End();
    }
}
