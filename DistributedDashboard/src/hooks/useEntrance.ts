// src/hooks/useEntrance.ts
// Shared entrance animation hook used across all screens.
// Returns animated style for a fade + slide-up entrance.
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function useEntrance(delay = 0) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(24)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, {
                toValue: 1, duration: 400, delay, useNativeDriver: true,
            }),
            Animated.timing(translateY, {
                toValue: 0, duration: 400, delay, useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return { opacity, transform: [{ translateY }] };
}

// Staggered version for lists — call once, get per-item style factory
export function useStaggerEntrance(count: number, baseDelay = 0, step = 70) {
    const anims = useRef(
        Array.from({ length: Math.max(count, 1) }, () => ({
            opacity: new Animated.Value(0),
            translateY: new Animated.Value(28),
        }))
    ).current;

    useEffect(() => {
        const animations = anims.slice(0, count).map((a, i) =>
            Animated.parallel([
                Animated.timing(a.opacity, { toValue: 1, duration: 350, delay: baseDelay + i * step, useNativeDriver: true }),
                Animated.timing(a.translateY, { toValue: 0, duration: 350, delay: baseDelay + i * step, useNativeDriver: true }),
            ])
        );
        Animated.stagger(step, animations).start();
    }, [count]);

    return (index: number) => ({
        opacity: anims[index]?.opacity ?? new Animated.Value(1),
        transform: [{ translateY: anims[index]?.translateY ?? new Animated.Value(0) }],
    });
}