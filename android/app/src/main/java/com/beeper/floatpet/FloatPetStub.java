package com.beeper.floatpet;

import android.content.Context;
import android.widget.Toast;

final class FloatPetStub {
    private FloatPetStub() { }
    static void showPermissionNotice(Context context) {
        Toast.makeText(context, "请先允许“在其他应用上层显示”，即可开启系统级悬浮宠物", Toast.LENGTH_LONG).show();
    }
}