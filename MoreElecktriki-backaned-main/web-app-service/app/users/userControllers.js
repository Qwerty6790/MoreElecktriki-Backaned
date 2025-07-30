const User = require('./userModel')

exports.getUserById = async (req, res) => {
    const { userId } = req.params;

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ username: user.username, email: user.email });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}