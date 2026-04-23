'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'

import { handleSignIn } from '../../lib/auth'
import { Card, SignInContainer } from '../../components/styled/Card'

export default function SignIn(/*props: { disableCustomTheme?: boolean }*/) {
    const router = useRouter()
    const [emailError, setEmailError] = React.useState(false)
    const [emailErrorMessage, setEmailErrorMessage] = React.useState('')
    const [passwordError, setPasswordError] = React.useState(false)
    const [passwordErrorMessage, setPasswordErrorMessage] = React.useState('')
    const [authErrorOpen, setAuthErrorOpen] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const [formData, setFormData] = React.useState({
        login: "",
        password: ""
    });

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormData((prevState) => ({
            ...prevState,
            [name]: value,
        }));
    }

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!validateInputs()) {
            return
        }
        setSubmitting(true)
        try {
            const result = await handleSignIn(formData)
            if (result?.error || !result?.ok) {
                setAuthErrorOpen(true)
                return
            }
            router.push('/dashboard')
            router.refresh()
        } finally {
            setSubmitting(false)
        }
    }

    const validateInputs = () => {

        let isValid = true
        const loginTrimmed = formData.login.trim()

        if (!loginTrimmed || loginTrimmed.length <= 3) {
            setEmailError(true)
            setEmailErrorMessage('Логин должен быть длиннее 3 символов.')
            isValid = false
        } else {
            setEmailError(false)
            setEmailErrorMessage('')
        }

        if (!formData.password || formData.password.length < 4) {
            setPasswordError(true)
            setPasswordErrorMessage('Password must be at least 4 characters long.')
            isValid = false
        } else {
            setPasswordError(false)
            setPasswordErrorMessage('')
        }

        return isValid
    }

    return (
        <SignInContainer direction="column" justifyContent="space-between">
            <Card variant="outlined">
                <Typography
                    component="h1"
                    variant="h4"
                    sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}
                >
                    Sign in
                </Typography>
                <Box
                    component="form"
                    onSubmit={handleSubmit}
                    noValidate
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        width: '100%',
                        gap: 2,
                    }}
                >
                    <FormControl>
                        <TextField
                            error={emailError}
                            helperText={emailErrorMessage}
                            id="login"
                            type="text"
                            name="login"
                            label="Login"
                            placeholder="Your Login"
                            autoComplete="login"
                            autoFocus
                            required
                            fullWidth
                            variant="outlined"
                            color={emailError ? 'error' : 'primary'}
                            onChange={handleChange}
                        />
                    </FormControl>
                    <FormControl>
                        <TextField
                            error={passwordError}
                            helperText={passwordErrorMessage}
                            name="password"
                            placeholder="••••••"
                            label="Password"
                            type="password"
                            id="password"
                            autoComplete="current-password"
                            required
                            fullWidth
                            variant="outlined"
                            color={passwordError ? 'error' : 'primary'}
                            onChange={handleChange}
                        />
                    </FormControl>
                    <Button type="submit" fullWidth variant="contained" disabled={submitting}>
                        Sign in
                    </Button>
                </Box>
            </Card>
            <Snackbar
                open={authErrorOpen}
                autoHideDuration={6000}
                onClose={() => setAuthErrorOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setAuthErrorOpen(false)} severity="error" variant="filled" sx={{ width: '100%' }}>
                    Неверный логин или пароль
                </Alert>
            </Snackbar>
        </SignInContainer>
    )
}