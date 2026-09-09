package com.hailey.minefinds;

public final class ShareCodePresentation {
    private ShareCodePresentation() {}

    public static String normalizedForDisplay(String code) {
        return JoinCodeUtils.normalize(code == null ? "" : code);
    }

    public static boolean shouldShowSavedCode(boolean shared, String code) {
        return shared && JoinCodeUtils.isValid(normalizedForDisplay(code));
    }
}
