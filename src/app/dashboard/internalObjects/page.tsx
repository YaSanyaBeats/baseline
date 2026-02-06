'use client'

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { 
    Box, 
    Button, 
    Card, 
    CardContent, 
    Container, 
    Dialog, 
    DialogActions, 
    DialogContent, 
    DialogContentText, 
    DialogTitle, 
    IconButton, 
    Paper, 
    Stack, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    TextField, 
    Typography,
    Alert,
    Skeleton,
    Chip
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BusinessIcon from '@mui/icons-material/Business';
import { red } from "@mui/material/colors";
import { useSnackbar } from "@/providers/SnackbarContext";
import { useTranslation } from "@/i18n/useTranslation";

interface InternalObject {
    id: number;
    name: string;
    type?: string;
    roomTypes: {
        units: {
            id: number;
            name: string;
        }[];
    }[];
}

export default function InternalObjectsPage() {
    const { data: session } = useSession();
    const { t } = useTranslation();
    const { setSnackbar } = useSnackbar();
    
    const [companyObject, setCompanyObject] = useState<InternalObject | null>(null);
    const [loading, setLoading] = useState(true);
    const [isInitialized, setIsInitialized] = useState(false);
    
    // Диалог добавления филиала
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newBranchName, setNewBranchName] = useState('');
    const [addingBranch, setAddingBranch] = useState(false);
    
    // Диалог редактирования филиала
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editBranchId, setEditBranchId] = useState<number | null>(null);
    const [editBranchName, setEditBranchName] = useState('');
    const [editingBranch, setEditingBranch] = useState(false);
    
    // Диалог удаления филиала
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteBranchId, setDeleteBranchId] = useState<number | null>(null);
    const [deletingBranch, setDeletingBranch] = useState(false);
    
    // Инициализация
    const [initializing, setInitializing] = useState(false);

    // Проверка прав доступа
    const userRole = (session?.user as any)?.role;
    const isAdmin = userRole === 'admin';

    const loadCompanyObject = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/objects?id[]=-1');
            const objects = await response.json();
            
            if (objects && objects.length > 0) {
                setCompanyObject(objects[0]);
                setIsInitialized(true);
            } else {
                setIsInitialized(false);
            }
        } catch (error) {
            console.error('Error loading company object:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setLoading(false);
        }
    }, [setSnackbar, t]);

    useEffect(() => {
        if (isAdmin) {
            loadCompanyObject();
        } else {
            setLoading(false);
        }
    }, [isAdmin, loadCompanyObject]);

    const handleInitialize = async () => {
        try {
            setInitializing(true);
            const response = await fetch('/api/internalObjects/init', {
                method: 'POST',
            });
            const result = await response.json();
            
            setSnackbar({
                open: true,
                message: result.message,
                severity: result.success ? 'success' : 'error',
            });
            
            if (result.success) {
                await loadCompanyObject();
            }
        } catch (error) {
            console.error('Error initializing company:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setInitializing(false);
        }
    };

    const handleAddBranch = async () => {
        if (!newBranchName.trim()) {
            setSnackbar({
                open: true,
                message: t('internalObjects.branchNameRequired'),
                severity: 'error',
            });
            return;
        }

        try {
            setAddingBranch(true);
            const response = await fetch('/api/internalObjects/branches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ branchName: newBranchName.trim() }),
            });
            const result = await response.json();
            
            setSnackbar({
                open: true,
                message: result.message,
                severity: result.success ? 'success' : 'error',
            });
            
            if (result.success) {
                setAddDialogOpen(false);
                setNewBranchName('');
                await loadCompanyObject();
            }
        } catch (error) {
            console.error('Error adding branch:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setAddingBranch(false);
        }
    };

    const handleEditBranch = async () => {
        if (!editBranchName.trim() || editBranchId === null) {
            return;
        }

        try {
            setEditingBranch(true);
            const response = await fetch('/api/internalObjects/branches', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    branchId: editBranchId, 
                    newName: editBranchName.trim() 
                }),
            });
            const result = await response.json();
            
            setSnackbar({
                open: true,
                message: result.message,
                severity: result.success ? 'success' : 'error',
            });
            
            if (result.success) {
                setEditDialogOpen(false);
                setEditBranchId(null);
                setEditBranchName('');
                await loadCompanyObject();
            }
        } catch (error) {
            console.error('Error editing branch:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setEditingBranch(false);
        }
    };

    const handleDeleteBranch = async () => {
        if (deleteBranchId === null) return;

        try {
            setDeletingBranch(true);
            const response = await fetch('/api/internalObjects/branches', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ branchId: deleteBranchId }),
            });
            const result = await response.json();
            
            setSnackbar({
                open: true,
                message: result.message,
                severity: result.success ? 'success' : 'error',
            });
            
            if (result.success) {
                setDeleteDialogOpen(false);
                setDeleteBranchId(null);
                await loadCompanyObject();
            }
        } catch (error) {
            console.error('Error deleting branch:', error);
            setSnackbar({
                open: true,
                message: t('common.serverError'),
                severity: 'error',
            });
        } finally {
            setDeletingBranch(false);
        }
    };

    const openEditDialog = (branchId: number, branchName: string) => {
        setEditBranchId(branchId);
        setEditBranchName(branchName);
        setEditDialogOpen(true);
    };

    const openDeleteDialog = (branchId: number) => {
        setDeleteBranchId(branchId);
        setDeleteDialogOpen(true);
    };

    if (!isAdmin) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Alert severity="error">
                    {t('internalObjects.noAccess')}
                </Alert>
            </Container>
        );
    }

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
                <Stack spacing={2}>
                    <Skeleton variant="rectangular" height={80} />
                    <Skeleton variant="rectangular" height={400} />
                </Stack>
            </Container>
        );
    }

    const branches = companyObject?.roomTypes?.[0]?.units || [];

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Stack spacing={3}>
                {/* Заголовок */}
                <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h4" component="h1" gutterBottom>
                            {t('internalObjects.title')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {t('internalObjects.subtitle')}
                        </Typography>
                    </Box>
                </Box>

                {/* Инициализация */}
                {!isInitialized && (
                    <Card>
                        <CardContent>
                            <Stack spacing={2}>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <BusinessIcon color="primary" fontSize="large" />
                                    <Typography variant="h6">
                                        {t('internalObjects.initializeCompany')}
                                    </Typography>
                                </Box>
                                <Typography variant="body2" color="text.secondary">
                                    {t('internalObjects.initializationInfo')}
                                </Typography>
                                <Box>
                                    <Button
                                        variant="contained"
                                        onClick={handleInitialize}
                                        disabled={initializing}
                                        startIcon={<BusinessIcon />}
                                    >
                                        {initializing ? t('accountancy.loading') : t('internalObjects.initializeCompany')}
                                    </Button>
                                </Box>
                            </Stack>
                        </CardContent>
                    </Card>
                )}

                {/* Объект "HolyCowPhuket внутренний объект" */}
                {isInitialized && companyObject && (
                    <>
                        <Card>
                            <CardContent>
                                <Stack spacing={2}>
                                    <Box display="flex" alignItems="center" justifyContent="space-between">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <BusinessIcon color="primary" fontSize="large" />
                                            <Box>
                                                <Typography variant="h6">
                                                    {companyObject.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    ID: {companyObject.id}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Chip 
                                            label={`${branches.length} ${t('internalObjects.branchesCount').toLowerCase()}`} 
                                            color="primary" 
                                            variant="outlined"
                                        />
                                    </Box>
                                </Stack>
                            </CardContent>
                        </Card>

                        {/* Филиалы */}
                        <Card>
                            <CardContent>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                    <Typography variant="h6">
                                        {t('internalObjects.branches')}
                                    </Typography>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={() => setAddDialogOpen(true)}
                                    >
                                        {t('internalObjects.addBranch')}
                                    </Button>
                                </Box>

                                {branches.length === 0 ? (
                                    <Alert severity="info">
                                        {t('internalObjects.noBranches')}
                                    </Alert>
                                ) : (
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>ID</TableCell>
                                                    <TableCell>{t('common.name')}</TableCell>
                                                    <TableCell align="right">{t('accountancy.actions')}</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {branches.map((branch) => (
                                                    <TableRow key={branch.id}>
                                                        <TableCell>{branch.id}</TableCell>
                                                        <TableCell>{branch.name}</TableCell>
                                                        <TableCell align="right">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => openEditDialog(branch.id, branch.name)}
                                                            >
                                                                <EditIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => openDeleteDialog(branch.id)}
                                                                sx={{ color: red[500] }}
                                                            >
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </Stack>

            {/* Диалог добавления филиала */}
            <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
                <DialogTitle>{t('internalObjects.addBranch')}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label={t('internalObjects.branchName')}
                        fullWidth
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        disabled={addingBranch}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAddDialogOpen(false)} disabled={addingBranch}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleAddBranch} variant="contained" disabled={addingBranch}>
                        {addingBranch ? t('accountancy.loading') : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Диалог редактирования филиала */}
            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)}>
                <DialogTitle>{t('internalObjects.editBranch')}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label={t('internalObjects.branchName')}
                        fullWidth
                        value={editBranchName}
                        onChange={(e) => setEditBranchName(e.target.value)}
                        disabled={editingBranch}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialogOpen(false)} disabled={editingBranch}>
                        {t('common.cancel')}
                    </Button>
                    <Button onClick={handleEditBranch} variant="contained" disabled={editingBranch}>
                        {editingBranch ? t('accountancy.loading') : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Диалог удаления филиала */}
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>{t('internalObjects.deleteBranch')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('internalObjects.confirmDeleteBranch')}
                    </DialogContentText>
                    <DialogContentText sx={{ mt: 1 }} color="text.secondary">
                        {t('internalObjects.deleteBranchIrreversible')}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)} disabled={deletingBranch}>
                        {t('common.cancel')}
                    </Button>
                    <Button 
                        onClick={handleDeleteBranch} 
                        color="error" 
                        variant="contained"
                        disabled={deletingBranch}
                    >
                        {deletingBranch ? t('accountancy.loading') : t('common.delete')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
